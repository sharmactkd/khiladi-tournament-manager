// src/pages/Contact.jsx
import React from "react";
import styles from "./Contact.module.css";

const Contact = () => {
  return (
    <div className={styles.container}>
      
      {/* HERO */}
      <section className={styles.hero}>
        <h3 className={styles.welcome}>GET IN TOUCH</h3>

        <h1 className={styles.title}>Contact KHILADI</h1>

        <p className={styles.subtitle}>
          We’re here to help you manage your tournaments better, faster, and more professionally
        </p>

        <p className={styles.tagline}>
          Smart. Fast. Professional Tournament Management
        </p>
      </section>

      {/* CONTACT INFO */}
      <section className={styles.contactSection}>
        <h2 className={styles.sectionTitle}>Contact Information</h2>

        <div className={styles.infoGrid}>
          <div className={styles.card}>
            <h4>Email</h4>
            <p>admin@ataindia.in</p>
          </div>

        

          <div className={styles.card}>
            <h4>Location</h4>
            <p>India</p>
          </div>
        </div>
      </section>

      {/* MESSAGE */}
      <section className={styles.messageSection}>
        <h2 className={styles.sectionTitle}>Send Us a Message</h2>

        <p className={styles.messageText}>
          Have questions, feedback, or need support? Reach out to us and our team will get back to you as soon as possible.
        </p>

        <form className={styles.form}>
          <input type="text" placeholder="Your Name" required />
          <input type="email" placeholder="Your Email" required />
          <textarea placeholder="Your Message" rows="5" required></textarea>

          <button type="submit">Send Message</button>
        </form>
      </section>

    </div>
  );
};

export default Contact;