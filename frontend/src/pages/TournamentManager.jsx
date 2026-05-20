import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const TournamentManager = () => {
  return (
    <>
      <Helmet>
        <title>Taekwondo Tournament Manager Software | KHILADI</title>
        <meta
          name="description"
          content="KHILADI is a professional Taekwondo tournament manager software for entries, tie-sheets, brackets, winners, team championship, officials and tournament records."
        />
        <meta
          name="keywords"
          content="taekwondo tournament manager, tournament manager software, martial arts tournament software, taekwondo championship software, KHILADI"
        />
        <link rel="canonical" href="https://khiladi-khoj.com/tournament-manager" />
      </Helmet>

      <main style={{ padding: "40px 20px", maxWidth: "1100px", margin: "0 auto" }}>
        <h1>Taekwondo Tournament Manager Software</h1>

        <p>
          KHILADI helps organizers manage Taekwondo tournaments professionally with
          player entries, team submissions, tie-sheet generation, winner records,
          team championship points, officials and payment records.
        </p>

        <h2>Manage Complete Taekwondo Championships</h2>
        <p>
          Create tournaments, collect entries, organize teams, generate match
          fixtures and manage tournament results from one secure platform.
        </p>

        <h2>Key Features</h2>
        <ul>
          <li>Online tournament creation</li>
          <li>Player entry management</li>
          <li>Team submission system</li>
          <li>Tie-sheet and bracket management</li>
          <li>Winner and medal records</li>
          <li>Team championship calculation</li>
          <li>Officials and team payment records</li>
        </ul>

        <Link to="/tournaments">View Tournaments</Link>
      </main>
    </>
  );
};

export default TournamentManager;