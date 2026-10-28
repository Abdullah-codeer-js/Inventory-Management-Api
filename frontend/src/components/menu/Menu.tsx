import { NavLink } from "react-router";
import {
  FiActivity,
  FiArchive,
  FiBarChart2,
  FiBox,
  FiGrid,
  FiSettings,
  FiTruck,
} from "react-icons/fi";

const links = [
  { title: "Overview", to: "/", icon: FiGrid, end: true },
  { title: "Products", to: "/products", icon: FiBox },
  { title: "Categories", to: "/categories", icon: FiArchive },
  { title: "Stock management", to: "/stock", icon: FiActivity },
  { title: "Inventory history", to: "/history", icon: FiBarChart2 },
  { title: "Suppliers", to: "/suppliers", icon: FiTruck },
  { title: "Reports & export", to: "/reports", icon: FiBarChart2 },
  { title: "Settings", to: "/settings", icon: FiSettings },
];

type Props = { onNavigate: () => void };

const Menu = ({ onNavigate }: Props) => (
  <nav className="menu" aria-label="Main navigation">
    <div className="menu-heading">Workspace</div>
    {links.map(({ title, to, icon: Icon, end }) => (
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) => `nav-item${isActive ? " nav-item-active" : ""}`}
        key={to}
        onClick={onNavigate}
      >
        <Icon aria-hidden="true" />
        <span>{title}</span>
      </NavLink>
    ))}
  </nav>
);

export default Menu;
