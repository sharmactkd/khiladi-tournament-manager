import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext"; // Verify this path
import styles from "./Header.module.css";

const Header = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();

  
  const handleLogout = () => {
    logout(); // Calls the logout function from AuthContext
  };

  // Fallback to email if name is unavailable
  const displayName = user?.name || user?.email || "User";

  return (
    <header className={styles.header}>
      <div className={styles.topBar}>
        <div className={styles.left}>
          <span className={styles.logo}>KHILADI</span>
        </div>
        
        <nav className={styles.navBar}>
          <ul className={styles.navList}>
            <li>
              <Link to="/" className={styles.navLink}>Home</Link>
            </li>
            <li>
              <Link to="/tournaments" className={styles.navLink}>Tournaments</Link>
            </li>
            <li>
              <Link to="/about" className={styles.navLink}>About Us</Link>
            </li>
            <li>
              <Link to="/contact" className={styles.navLink}>Contact</Link>
            </li>
          </ul>
        </nav>
        
        <div className={styles.right}>
          {isAuthenticated ? (
            <div className={styles.userSection}>
              <span>Hello, {displayName}</span>
              <button onClick={handleLogout} className={styles.logoutButton}>
                Logout
              </button>
            </div>
          ) : (
            <div className={styles.authLinks}>
              <Link to="/login" className={styles.navLink}>Login /</Link>
              <Link to="/register" className={styles.navLink}> Register</Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;