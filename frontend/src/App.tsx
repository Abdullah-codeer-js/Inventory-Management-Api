import { useState } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from "react-router";
import Navbar from "./components/header/Navbar";
import Menu from "./components/menu/Menu";
import Home from "./pages/home/Home";
import Products from "./pages/products/Products";
import Categories from "./pages/categories/Categories";
import Suppliers from "./pages/suppliers/Suppliers";
import Stock from "./pages/stock/Stock";
import InventoryHistory from "./pages/history/InventoryHistory";
import Reports from "./pages/reports/Reports";
import Settings from "./pages/settings/Settings";
import "./styles/global.css";
import "./components/header/navbar.css";

function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <Navbar onMenuClick={() => setMenuOpen((open) => !open)} />
      <div className="app-body">
        <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
          <Menu onNavigate={() => setMenuOpen(false)} />
        </aside>
        {menuOpen && (
          <button
            aria-label="Close navigation"
            className="sidebar-backdrop"
            onClick={() => setMenuOpen(false)}
          />
        )}
        <main className="page-content">
          <Outlet />
        </main>
      </div>
      <footer className="app-footer">Inventory Management System</footer>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "products", element: <Products /> },
      { path: "categories", element: <Categories /> },
      { path: "suppliers", element: <Suppliers /> },
      { path: "stock", element: <Stock /> },
      { path: "history", element: <InventoryHistory /> },
      { path: "reports", element: <Reports /> },
      { path: "settings", element: <Settings /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
