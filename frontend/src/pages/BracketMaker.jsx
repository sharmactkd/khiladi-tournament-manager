import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const BracketMaker = () => {
  return (
    <>
      <Helmet>
        <title>Bracket Maker for Taekwondo Tournaments | KHILADI</title>
        <meta
          name="description"
          content="Create professional Taekwondo tournament brackets and match fixtures with KHILADI bracket maker and tournament manager."
        />
        <meta
          name="keywords"
          content="bracket maker, bracket manager, tournament bracket maker, taekwondo bracket maker, martial arts bracket generator, KHILADI"
        />
        <link rel="canonical" href="https://khiladi-khoj.com/bracket-maker" />
      </Helmet>

      <main style={{ padding: "40px 20px", maxWidth: "1100px", margin: "0 auto" }}>
        <h1>Taekwondo Bracket Maker</h1>

        <p>
          KHILADI provides a clean and professional bracket maker for Taekwondo
          tournaments. Organizers can manage players, generate fixtures and handle
          match flow more efficiently.
        </p>

        <h2>Professional Bracket Management</h2>
        <p>
          Build tournament brackets based on player entries, age categories,
          gender, weight categories and event types.
        </p>

        <h2>Useful For</h2>
        <ul>
          <li>Taekwondo championships</li>
          <li>Martial arts tournaments</li>
          <li>School and academy competitions</li>
          <li>Open invitational events</li>
          <li>State and national level events</li>
        </ul>

        <Link to="/tournaments">Start Managing Tournaments</Link>
      </main>
    </>
  );
};

export default BracketMaker;