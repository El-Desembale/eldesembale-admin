// Motor de cálculo de créditos y cuotas.
//
// Modelo: el costo del crédito es 10% mensual sobre el CAPITAL INICIAL (no sobre saldo),
// multiplicado por los meses de plazo. Ese costo se divide en tres conceptos configurables
// (interés / plataforma / administrativo). Sobre cada cuota se aplica un "gross-up" de la
// comisión de Wompi para que la empresa reciba la cuota completa; el cliente nunca ve Wompi
// como concepto independiente: se absorbe dentro de "Plataforma".
//
// Los valores se calculan una sola vez al crear el crédito y se guardan (snapshot). No se
// recalculan cuotas históricas aunque cambien las tarifas o porcentajes.

export type PaymentPeriod = 'Mensual' | 'Quincenal';

export interface PricingSplit {
  /** Porción del costo total que es interés (0..1). */
  interes: number;
  /** Porción del costo total que es plataforma (0..1). */
  plataforma: number;
  /** Porción del costo total que es administrativo (0..1). */
  administrativo: number;
}

export interface WompiFees {
  /** Tarifa variable de Wompi (ej. 0.0265 = 2.65%). */
  porcentaje: number;
  /** Tarifa fija de Wompi por transacción, en pesos (ej. 700). */
  fijo: number;
  /** IVA aplicado sobre las tarifas de Wompi (ej. 0.19 = 19%). */
  iva: number;
}

export interface LoanPricingConfig {
  /** Interés mensual sobre el capital (ej. 0.10 = 10%). */
  interesMensual: number;
  split: PricingSplit;
  wompi: WompiFees;
}

export interface LoanPricingInput {
  /** Capital desembolsado / solicitado. */
  capital: number;
  /** Número de cuotas (2, 3 o 4). */
  numeroCuotas: number;
  paymentPeriod: PaymentPeriod;
  /** Fecha de desembolso (base para las fechas de vencimiento). */
  fechaDesembolso: Date;
}

export interface InstallmentBreakdown {
  numeroCuota: number;
  fechaVencimiento: Date;
  capital: number;
  interes: number;
  plataforma: number;
  administrativo: number;
  /** interes + plataforma + administrativo (costo del crédito de la cuota, sin Wompi). */
  costosCredito: number;
  /** capital + costosCredito (lo que recibe la empresa por la cuota). */
  cuotaCredito: number;
  /** Comisión de Wompi de la cuota (almacenada aparte para contabilidad). */
  comisionWompi: number;
  /** Lo que paga el cliente: cuotaCredito + comisionWompi. */
  totalCliente: number;
  /** Plataforma mostrada al cliente: plataforma + comisionWompi (Wompi absorbido). */
  plataformaCliente: number;
}

export interface LoanPricing {
  version: number;
  capital: number;
  numeroCuotas: number;
  mesesPlazo: number;
  paymentPeriod: PaymentPeriod;
  interesMensual: number;
  split: PricingSplit;
  wompi: WompiFees;
  costoTotalCredito: number;
  interesTotal: number;
  plataformaTotal: number;
  administrativoTotal: number;
  wompiTotal: number;
  /** capital + costoTotalCredito (lo que recibe la empresa, sin Wompi). */
  totalCreditoSinWompi: number;
  /** Suma de lo que paga el cliente en todas las cuotas. */
  totalCliente: number;
  installments: InstallmentBreakdown[];
}

export const DEFAULT_PRICING_CONFIG: LoanPricingConfig = {
  interesMensual: 0.1,
  split: { interes: 0.5, plataforma: 0.3, administrativo: 0.2 },
  wompi: { porcentaje: 0.0265, fijo: 700, iva: 0.19 },
};

/** Meses de plazo cobrados: Quincenal cobra medio mes por cuota; Mensual un mes por cuota. */
export function mesesPlazo(numeroCuotas: number, paymentPeriod: PaymentPeriod): number {
  return paymentPeriod === 'Quincenal' ? numeroCuotas / 2 : numeroCuotas;
}

/**
 * Fecha de vencimiento de la cuota `index` (0-based).
 * La primera cuota (index 0) vence 30 días después del desembolso; las siguientes son
 * mensuales (+1 mes) o quincenales (+15 días). Misma lógica que la app/web actuales.
 */
export function installmentDueDate(base: Date, index: number, paymentPeriod: PaymentPeriod): Date {
  const first = new Date(base.getFullYear(), base.getMonth() + 1, base.getDate());
  if (paymentPeriod === 'Mensual') {
    return new Date(first.getFullYear(), first.getMonth() + index, first.getDate());
  }
  return new Date(first.getTime() + 15 * index * 24 * 60 * 60 * 1000);
}

/** Gross-up de Wompi: total a cobrar al cliente para que la empresa reciba `cuotaCredito`. */
export function grossUpWompi(cuotaCredito: number, wompi: WompiFees): number {
  const ivaFactor = 1 + wompi.iva;
  return (cuotaCredito + wompi.fijo * ivaFactor) / (1 - wompi.porcentaje * ivaFactor);
}

/**
 * Calcula el desglose completo del crédito. Redondea cada concepto a pesos enteros y ajusta
 * las diferencias por redondeo en la última cuota, de modo que la suma de las cuotas coincida
 * exactamente con los totales.
 */
export function computeLoanPricing(
  input: LoanPricingInput,
  config: LoanPricingConfig = DEFAULT_PRICING_CONFIG,
): LoanPricing {
  const { capital, numeroCuotas, paymentPeriod, fechaDesembolso } = input;
  const n = numeroCuotas;
  const meses = mesesPlazo(n, paymentPeriod);

  const costoTotalCredito = Math.round(capital * config.interesMensual * meses);
  const interesTotal = costoTotalCredito * config.split.interes;
  const plataformaTotal = costoTotalCredito * config.split.plataforma;
  const administrativoTotal = costoTotalCredito * config.split.administrativo;

  // Valores precisos por cuota (antes de redondear).
  const capitalCuota = capital / n;
  const interesCuota = interesTotal / n;
  const plataformaCuota = plataformaTotal / n;
  const administrativoCuota = administrativoTotal / n;
  const cuotaCreditoPreciso = capitalCuota + interesCuota + plataformaCuota + administrativoCuota;
  const totalClientePreciso = grossUpWompi(cuotaCreditoPreciso, config.wompi);

  // Acumuladores para ajustar la última cuota.
  let accCapital = 0;
  let accInteres = 0;
  let accPlataforma = 0;
  let accAdministrativo = 0;
  let accComisionWompi = 0;
  let accTotalCliente = 0;

  // Totales redondeados (objetivo que deben sumar las cuotas).
  const capitalRedondeado = Math.round(capital);
  const interesRedondeado = Math.round(interesTotal);
  const plataformaRedondeado = Math.round(plataformaTotal);
  const administrativoRedondeado = Math.round(administrativoTotal);
  const totalClienteRedondeado = Math.round(totalClientePreciso * n);
  // wompiTotal se deriva de los anteriores para mantener la identidad contable:
  // totalCliente = capital + costos + wompi.
  const costosRedondeado = interesRedondeado + plataformaRedondeado + administrativoRedondeado;

  const installments: InstallmentBreakdown[] = [];

  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;

    const capitalI = isLast ? capitalRedondeado - accCapital : Math.round(capitalCuota);
    const interesI = isLast ? interesRedondeado - accInteres : Math.round(interesCuota);
    const plataformaI = isLast ? plataformaRedondeado - accPlataforma : Math.round(plataformaCuota);
    const administrativoI = isLast
      ? administrativoRedondeado - accAdministrativo
      : Math.round(administrativoCuota);
    const costosCreditoI = interesI + plataformaI + administrativoI;
    const cuotaCreditoI = capitalI + costosCreditoI;
    const totalClienteI = isLast
      ? totalClienteRedondeado - accTotalCliente
      : Math.round(totalClientePreciso);
    const comisionWompiI = totalClienteI - cuotaCreditoI;
    const plataformaClienteI = plataformaI + comisionWompiI;

    accCapital += capitalI;
    accInteres += interesI;
    accPlataforma += plataformaI;
    accAdministrativo += administrativoI;
    accComisionWompi += comisionWompiI;
    accTotalCliente += totalClienteI;

    installments.push({
      numeroCuota: i + 1,
      fechaVencimiento: installmentDueDate(fechaDesembolso, i, paymentPeriod),
      capital: capitalI,
      interes: interesI,
      plataforma: plataformaI,
      administrativo: administrativoI,
      costosCredito: costosCreditoI,
      cuotaCredito: cuotaCreditoI,
      comisionWompi: comisionWompiI,
      totalCliente: totalClienteI,
      plataformaCliente: plataformaClienteI,
    });
  }

  return {
    version: 1,
    capital: capitalRedondeado,
    numeroCuotas: n,
    mesesPlazo: meses,
    paymentPeriod,
    interesMensual: config.interesMensual,
    split: config.split,
    wompi: config.wompi,
    costoTotalCredito,
    interesTotal: interesRedondeado,
    plataformaTotal: plataformaRedondeado,
    administrativoTotal: administrativoRedondeado,
    wompiTotal: accComisionWompi,
    totalCreditoSinWompi: capitalRedondeado + costosRedondeado,
    totalCliente: accTotalCliente,
    installments,
  };
}

function asNum(v: unknown, fallback = 0): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : fallback;
}

function asDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === 'string') return new Date(v);
  // Firestore Timestamp-like { toDate() }
  if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate();
  }
  return new Date(NaN);
}

/** Reconstruye un LoanPricing desde el doc de Firestore (snake_case, fechas ISO). */
export function pricingFromFirestore(raw: Record<string, unknown> | undefined | null): LoanPricing | null {
  if (!raw) return null;
  const split = (raw.split as Record<string, unknown>) || {};
  const wompi = (raw.wompi as Record<string, unknown>) || {};
  const rawInstallments = Array.isArray(raw.installments) ? raw.installments : [];
  return {
    version: asNum(raw.version, 1),
    capital: asNum(raw.capital),
    numeroCuotas: asNum(raw.numero_cuotas),
    mesesPlazo: asNum(raw.meses_plazo),
    paymentPeriod: (raw.payment_period as PaymentPeriod) || 'Mensual',
    interesMensual: asNum(raw.interes_mensual),
    split: {
      interes: asNum(split.interes),
      plataforma: asNum(split.plataforma),
      administrativo: asNum(split.administrativo),
    },
    wompi: {
      porcentaje: asNum(wompi.porcentaje),
      fijo: asNum(wompi.fijo),
      iva: asNum(wompi.iva),
    },
    costoTotalCredito: asNum(raw.costo_total_credito),
    interesTotal: asNum(raw.interes_total),
    plataformaTotal: asNum(raw.plataforma_total),
    administrativoTotal: asNum(raw.administrativo_total),
    wompiTotal: asNum(raw.wompi_total),
    totalCreditoSinWompi: asNum(raw.total_credito_sin_wompi),
    totalCliente: asNum(raw.total_cliente),
    installments: (rawInstallments as Record<string, unknown>[]).map((c) => ({
      numeroCuota: asNum(c.numero_cuota),
      fechaVencimiento: asDate(c.fecha_vencimiento),
      capital: asNum(c.capital),
      interes: asNum(c.interes),
      plataforma: asNum(c.plataforma),
      administrativo: asNum(c.administrativo),
      costosCredito: asNum(c.costos_credito),
      cuotaCredito: asNum(c.cuota_credito),
      comisionWompi: asNum(c.comision_wompi),
      totalCliente: asNum(c.total_cliente),
      plataformaCliente: asNum(c.plataforma_cliente),
    })),
  };
}

/** Serializa el pricing a snake_case para guardar en Firestore (con fechas ISO). */
export function pricingToFirestore(p: LoanPricing): Record<string, unknown> {
  return {
    version: p.version,
    capital: p.capital,
    numero_cuotas: p.numeroCuotas,
    meses_plazo: p.mesesPlazo,
    payment_period: p.paymentPeriod,
    interes_mensual: p.interesMensual,
    split: {
      interes: p.split.interes,
      plataforma: p.split.plataforma,
      administrativo: p.split.administrativo,
    },
    wompi: { porcentaje: p.wompi.porcentaje, fijo: p.wompi.fijo, iva: p.wompi.iva },
    costo_total_credito: p.costoTotalCredito,
    interes_total: p.interesTotal,
    plataforma_total: p.plataformaTotal,
    administrativo_total: p.administrativoTotal,
    wompi_total: p.wompiTotal,
    total_credito_sin_wompi: p.totalCreditoSinWompi,
    total_cliente: p.totalCliente,
    installments: p.installments.map((c) => ({
      numero_cuota: c.numeroCuota,
      fecha_vencimiento: c.fechaVencimiento.toISOString(),
      capital: c.capital,
      interes: c.interes,
      plataforma: c.plataforma,
      administrativo: c.administrativo,
      costos_credito: c.costosCredito,
      cuota_credito: c.cuotaCredito,
      comision_wompi: c.comisionWompi,
      total_cliente: c.totalCliente,
      plataforma_cliente: c.plataformaCliente,
    })),
  };
}
