export const appCurrency = 'FCFA'

export function formatMoney(value: number) {
  return `${Math.round(value).toLocaleString('fr-FR')} ${appCurrency}`
}

export function formatSignedMoney(value: number, sign: '+' | '-' = '+') {
  return `${sign}${formatMoney(value)}`
}
