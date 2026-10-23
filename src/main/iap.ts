import { app, inAppPurchase } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { LicenseState, StoreProduct } from '../shared/types'

/**
 * Store billing. Mac App Store: Electron's inAppPurchase (StoreKit). Microsoft Store: purchases happen in the
 * Store page (add-ons) and the app reads entitlement via the license server. Outside a store build, purchase is disabled.
 */
export const PRODUCTS: Record<string, { plan: 'pro' | 'max'; kind: 'monthly' | 'yearly' | 'lifetime' }> = {
  'app.switchcoder.pro.monthly': { plan: 'pro', kind: 'monthly' },
  'app.switchcoder.pro.yearly': { plan: 'pro', kind: 'yearly' },
  'app.switchcoder.pro.lifetime': { plan: 'pro', kind: 'lifetime' },
  'app.switchcoder.max.monthly': { plan: 'max', kind: 'monthly' },
  'app.switchcoder.max.yearly': { plan: 'max', kind: 'yearly' },
  'app.switchcoder.max.lifetime': { plan: 'max', kind: 'lifetime' },
}
const licenseFile = () => join(app.getPath('userData'), 'license.json')
export function loadLicense(): LicenseState { try { return JSON.parse(readFileSync(licenseFile(), 'utf8')) } catch { return { plan: 'free', source: 'none' } } }
function saveLicense(l: LicenseState) { writeFileSync(licenseFile(), JSON.stringify(l, null, 2)) }

export const storeKind = (): 'mas' | 'windows-store' | 'none' => (process.mas ? 'mas' : process.windowsStore ? 'windows-store' : 'none')

export async function products(): Promise<StoreProduct[]> {
  if (storeKind() !== 'mas' || !inAppPurchase.canMakePayments()) return []
  const list = await inAppPurchase.getProducts(Object.keys(PRODUCTS))
  return list.map((p) => ({ id: p.productIdentifier, title: p.localizedTitle, description: p.localizedDescription, price: p.formattedPrice, ...PRODUCTS[p.productIdentifier] }))
}

let listening = false
export function listen(onChange: (l: LicenseState) => void, verify?: (receiptBase64: string) => Promise<LicenseState | null>) {
  if (listening || storeKind() !== 'mas') return
  listening = true
  inAppPurchase.on('transactions-updated', (_e, transactions) => {
    void (async () => {
      for (const t of transactions) {
        if (t.transactionState === 'purchased' || t.transactionState === 'restored') {
          const meta = PRODUCTS[t.payment.productIdentifier]
          let lic: LicenseState | null = null
          try { const receipt = readFileSync(inAppPurchase.getReceiptURL()).toString('base64'); if (verify) lic = await verify(receipt) } catch { /* no receipt yet */ }
          if (!lic && meta) lic = { plan: meta.plan, source: 'mas', productId: t.payment.productIdentifier, kind: meta.kind, since: Date.now(), verified: false }
          if (lic) { saveLicense(lic); onChange(lic) }
          inAppPurchase.finishTransactionByDate(t.transactionDate)
        } else if (t.transactionState === 'failed') {
          inAppPurchase.finishTransactionByDate(t.transactionDate)
        }
      }
    })()
  })
}

export async function purchase(productId: string): Promise<boolean> {
  if (storeKind() !== 'mas') throw new Error('Purchases are available in the App Store version.')
  if (!PRODUCTS[productId]) throw new Error('Unknown product')
  return inAppPurchase.purchaseProduct(productId, { quantity: 1 })
}
export function restore(): void { if (storeKind() === 'mas') inAppPurchase.restoreCompletedTransactions() }
export function hasReceipt(): boolean { try { return storeKind() === 'mas' && existsSync(inAppPurchase.getReceiptURL()) } catch { return false } }
