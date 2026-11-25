import { createHashRouter, Outlet, RouterProvider } from 'react-router'
import { Spinner } from './components/ui'
import { AuthProvider, useAuth } from './context/auth'
import AdminLayout from './pages/AdminLayout'
import { AdminCustomers, AdminMessages, AdminReviews, AdminSettings } from './pages/AdminMisc'
import { AdminOrderDetail, AdminOrders } from './pages/AdminOrders'
import { AdminProducts, ProductForm } from './pages/AdminProducts'
import Login from './pages/Login'
import Overview from './pages/Overview'
import SitePhotos from './pages/SitePhotos'

/** Row Level Security in Supabase is the real guard; this only decides what to show. */
function Gate() {
  const { session, isAdmin, loading } = useAuth()
  if (loading) return <Spinner />
  return session && isAdmin ? <AdminLayout /> : <Login />
}

const router = createHashRouter([{
  element: <AuthProvider><Outlet /></AuthProvider>,
  children: [{
    element: <Gate />,
    children: [
      { index: true, element: <Overview /> },
      { path: 'products', element: <AdminProducts /> },
      { path: 'products/:id', element: <ProductForm /> },
      { path: 'orders', element: <AdminOrders /> },
      { path: 'orders/:id', element: <AdminOrderDetail /> },
      { path: 'photos', element: <SitePhotos /> },
      { path: 'customers', element: <AdminCustomers /> },
      { path: 'reviews', element: <AdminReviews /> },
      { path: 'messages', element: <AdminMessages /> },
      { path: 'settings', element: <AdminSettings /> },
      { path: '*', element: <Overview /> },
    ],
  }],
}])

export default function App() {
  return <RouterProvider router={router} />
}
