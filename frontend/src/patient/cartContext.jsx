import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

const CartContext = createContext(null)

const STORAGE_KEY = 'smartrx:cart'
const ORDER_KEY = 'smartrx:last-order'

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback
  } catch {
    return fallback
  }
}

/**
 * Reorder cart. Device-local: there is no orders table, and an order here is a
 * demo intent, not a transaction. Quantities are per family member and per
 * schedule, so the same medicine for two people stays separate.
 */
export function CartProvider({ children }) {
  const [items, setItems] = useState(() => load(STORAGE_KEY, []))
  const [lastOrder, setLastOrder] = useState(() => load(ORDER_KEY, null))

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const add = useCallback((item) => {
    setItems((prev) => {
      if (prev.some((entry) => entry.key === item.key)) {
        return prev.map((entry) =>
          entry.key === item.key ? { ...entry, quantity: entry.quantity + 1 } : entry,
        )
      }
      return [...prev, { ...item, quantity: 1 }]
    })
  }, [])

  const setQuantity = useCallback((key, quantity) => {
    setItems((prev) =>
      quantity <= 0
        ? prev.filter((entry) => entry.key !== key)
        : prev.map((entry) => (entry.key === key ? { ...entry, quantity } : entry)),
    )
  }, [])

  const remove = useCallback((key) => {
    setItems((prev) => prev.filter((entry) => entry.key !== key))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const order = useCallback(() => {
    const record = {
      count: items.reduce((sum, entry) => sum + entry.quantity, 0),
      at: new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
    }
    setLastOrder(record)
    localStorage.setItem(ORDER_KEY, JSON.stringify(record))
    setItems([])
  }, [items])

  const dismissOrder = useCallback(() => {
    setLastOrder(null)
    localStorage.removeItem(ORDER_KEY)
  }, [])

  const count = useMemo(
    () => items.reduce((sum, entry) => sum + entry.quantity, 0),
    [items],
  )

  const value = useMemo(
    () => ({ items, count, add, setQuantity, remove, clear, order, lastOrder, dismissOrder }),
    [items, count, add, setQuantity, remove, clear, order, lastOrder, dismissOrder],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within a CartProvider')
  return context
}
