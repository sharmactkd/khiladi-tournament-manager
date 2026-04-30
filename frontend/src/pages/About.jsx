// src/pages/About.jsx
import React from "react";
import styles from "./About.module.css";

const About = () => {
  return (
    <div className={styles.container}>
      {/* HERO SECTION */}
      <section className={styles.hero}>
        <h3 className={styles.welcome}>WELCOME TO THE</h3>

        <h1 className={styles.title}>
          KHILADI TOURNAMENT MANAGER
        </h1>

        <p className={styles.subtitle}>
          The Most Advanced Tournament Manager for Organizers, built for speed, precision, and complete championship control.
        </p>

        <p className={styles.highlight}>
          More Features. More Control. More Power Than Any System.
        </p>

        <p className={styles.tagline}>
          Smart. Fast. Professional Tournament Management.
        </p>
      </section>

      {/* ABOUT CONTENT */}
      <section className={styles.aboutSection}>
        <h2 className={styles.sectionTitle}>About KHILADI</h2>

        <p>
          KHILADI is a professional-grade Taekwondo Tournament Management platform built to simplify,
          streamline, and elevate the way championships are organized.
        </p>

        <p>
          Designed specifically for Taekwondo events, KHILADI provides a complete digital ecosystem
          that covers every stage of tournament management — from tournament creation, player entries,
          and team submissions to automated tie-sheet generation, real-time winner declaration,
          medal tracking, and team championship rankings.
        </p>

        <p>
          The platform supports all major event categories including Kyorugi, Poomsae, Freshers,
          and Tag Team, making it suitable for events of every scale — from school-level competitions
          to national championships.
        </p>

        <p>
          By eliminating manual errors, reducing paperwork, and automating complex processes,
          KHILADI empowers organizers to operate with accuracy, speed, and professionalism.
        </p>

        <p className={styles.boldLine}>
          From entries to medals — everything automated.
        </p>
      </section>

      {/* FEATURES SECTION */}
      <section className={styles.features}>
        <h2 className={styles.sectionTitle}>Core Capabilities</h2>

        <div className={styles.featureGrid}>
          <div className={styles.card}>Tournament Creation & Management</div>
          <div className={styles.card}>Smart Player Entry System</div>
          <div className={styles.card}>Automated Tie-Sheet Generation</div>
          <div className={styles.card}>Real-Time Winner Declaration</div>
          <div className={styles.card}>Medal Tracking System</div>
          <div className={styles.card}>Team Championship Calculation</div>
          <div className={styles.card}>PDF Reports & Print Ready Sheets</div>
          <div className={styles.card}>Multi Event Support</div>
        </div>
      </section>
    </div>
  );
};

export default About;