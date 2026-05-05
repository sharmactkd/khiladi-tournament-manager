import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./Admin.module.css";

const adminLinks = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/tournaments", label: "Tournaments" },
 
  { to: "/admin/entries", label: "Entries" },
];

const isAdminUser = (user) => ["admin", "superadmin"].includes(user?.role);

const AdminLayout = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  if (!isAuthenticated) {
    return (
      <section className={styles.accessBox}>
        <h1>Admin Login Required</h1>
        <p>Please login with an admin account to access this panel.</p>
        <button type="button" onClick={() => navigate("/login")} className={styles.primaryBtn}>
          Go to Login
        </button>
      </section>
    );
  }

  if (!isAdminUser(user)) {
    return (
      <section className={styles.accessBox}>
        <h1>Access Denied</h1>
        <p>Your account does not have permission to access the Super Admin Panel.</p>
        <button type="button" onClick={() => navigate("/")} className={styles.primaryBtn}>
          Back to Website
        </button>
      </section>
    );
  }

  return (
    <section className={styles.adminShell}>
      <aside className={styles.sidebar}>
        <div className={styles.brandBlock}>
          <span className={styles.brandMini}>KHILADI</span>
          <h2>Super Admin</h2>
          <p>{user?.email || user?.phone || user?.name}</p>
        </div>

        <nav className={styles.navList}>
          {adminLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `${styles.navLink} ${isActive ? styles.activeNavLink : ""}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <button type="button" onClick={() => navigate("/")} className={styles.secondaryBtn}>
            Back to Site
          </button>
          <button type="button" onClick={() => logout("/login")} className={styles.dangerBtn}>
            Logout
          </button>
        </div>
      </aside>

      <div className={styles.adminMain}>
        <header className={styles.topbar}>
          <div>
            <span className={styles.kicker}>Admin Control Center</span>
            <h1>KHILADI Management Panel</h1>
          </div>
          <span className={styles.roleBadge}>{user?.role}</span>
        </header>

        <Outlet />
      </div>
    </section>
  );
};

export default AdminLayout;