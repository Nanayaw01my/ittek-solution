import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Keeps document.title as the *page* name only.
 *
 * In an installed PWA the window title bar is the manifest name plus
 * document.title, so repeating the company name here produced
 * "ITTEK Solution — DAN & DOR SOLAR - ITTEK Solution - DAN & DOR SOLAR".
 * Naming just the screen gives "ITTEK Solution — DAN & DOR SOLAR - Point of
 * Sale", which is what a desktop app should read like, and also labels browser
 * tabs usefully.
 */
const ROUTE_TITLES = {
  '/dashboard': 'Dashboard',
  '/pos': 'Point of Sale',
  '/products': 'Products',
  '/categories': 'Categories',
  '/suppliers': 'Suppliers',
  '/purchases': 'Purchases',
  '/expenses': 'Expenses',
  '/debts': 'Debts',
  '/layaways': 'Layaways',
  '/fraud-alerts': 'Fraud Alerts',
  '/credit-agreements': 'Credit Agreements',
  '/stock-requests': 'Stock Requests',
  '/workers': 'Worker Payments',
  '/financial': 'Financial',
  '/reports': 'Reports',
  '/sales-history': 'Sales History',
  '/refunds': 'Refunds',
  '/users': 'User Management',
  '/audit-logs': 'Audit Logs',
  '/backup': 'Backup & Restore',
  '/settings': 'Settings',
  '/notifications': 'Notifications',
  '/search': 'Search',
  '/login': 'Sign In',
}

const BASE_TITLE = 'ITTEK Solution'

export default function useDocumentTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    // Public receipt pages are read by customers, not staff.
    if (pathname.startsWith('/r/')) {
      document.title = 'Receipt'
      return
    }

    const page = ROUTE_TITLES[pathname]
    document.title = page || BASE_TITLE
  }, [pathname])
}
