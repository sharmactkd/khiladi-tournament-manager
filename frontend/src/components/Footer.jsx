import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getVisitorCount } from "../api.js";
import styles from "./Footer.module.css";

const Footer = () => {
  const [visitorCount, setVisitorCount] = useState(null);
  const location = useLocation();
  const year = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const data = await getVisitorCount();
        const count = typeof data?.count === "number" ? data.count : null;
        if (mounted) setVisitorCount(count);
      } catch {
        if (mounted) setVisitorCount(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  void location;

  return (
    <footer className={styles.footer}>
      <div className={styles.footerContainer}>
        <div className={styles.footerGrid}>
          {/* Left */}
          <div>
            <div className={styles.footerTitle}>KHILADI-KHOJ</div>
            <div className={styles.footerMuted}>KHILADI Tournament Manager for Taekwondo</div>

            <div className={styles.footerVisitor}>
              Visitors:{" "}
              <span>
                {typeof visitorCount === "number" ? visitorCount : "—"}
              </span>
            </div>
          </div>

          {/* Middle */}
          <div>
            <div className={styles.footerTitle}>Quick Links</div>
            <div className={styles.footerLinks}>
              <Link to="/">Home</Link>
              <Link to="/tournaments">Tournaments</Link>
              <Link to="/about">About</Link>
              <Link to="/contact">Contact</Link>
            </div>
          </div>

          {/* Right */}
          <div>
            <div className={styles.footerTitle}>Contact</div>
            <div className={styles.footerMuted}>
              <div>Email: <span className={styles.footerStrong}>admin@ataindia.in</span></div>
              
            </div>

          </div>
        </div>

        <div className={styles.footerBottom}>
          <div>© {year} KHILADI. All rights reserved.</div>
          <div className={styles.footerBottomRight}>Built for secure, fast tournament operations.</div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;