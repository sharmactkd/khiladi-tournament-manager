import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const TieSheetMaker = () => {
  return (
    <>
      <Helmet>
        <title>Taekwondo Tie Sheet Maker | KHILADI</title>
        <meta
          name="description"
          content="Generate and manage Taekwondo tie-sheets professionally with KHILADI. Create match fixtures, declare winners and manage medal records."
        />
        <meta
          name="keywords"
          content="tie sheet maker, taekwondo tie sheet maker, tiesheet maker, tournament tie sheet, taekwondo fixture maker, KHILADI"
        />
        <link rel="canonical" href="https://khiladi-khoj.com/tie-sheet-maker" />
      </Helmet>

      <main style={{ padding: "40px 20px", maxWidth: "1100px", margin: "0 auto" }}>
        <h1>Taekwondo Tie Sheet Maker</h1>

        <p>
          KHILADI helps tournament organizers create and manage Taekwondo
          tie-sheets with player entries, brackets, winner declaration and medal
          synchronization.
        </p>

        <h2>Why Use KHILADI Tie Sheet Maker?</h2>
        <p>
          Manual tie-sheet preparation can be slow and error-prone. KHILADI makes
          the process easier by connecting entries, match fixtures, winners and
          team championship records.
        </p>

        <h2>Features</h2>
        <ul>
          <li>Generate tournament tie-sheets</li>
          <li>Manage match brackets</li>
          <li>Declare winners</li>
          <li>Sync medals with entry records</li>
          <li>Calculate team championship points</li>
        </ul>

        <Link to="/tournaments">Explore KHILADI</Link>
      </main>
    </>
  );
};

export default TieSheetMaker;