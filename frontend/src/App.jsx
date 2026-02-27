import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Header from "./components/Header";
import Login from "./pages/Login";
import Register from "./pages/Register";
import TournamentForm from "./pages/TournamentForm";
import TournamentDetails from "./pages/TournamentDetails";
import SocialLogin from "./pages/SocialLogin";
import TournamentsPages from "./pages/TournamentsPages";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Entry from "./pages/Entry";
import TieSheet from "./pages/TieSheet";
import TieSheetRecord from "./pages/TieSheetRecord";
import Winner from "./pages/Winner";
import TeamChampionship from "./pages/TeamChampionship";
import Official from "./pages/Official";
import Team from "./pages/Team";
import TournamentLayout from "./components/TournamentLayout";
import "./App.css";

function App() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    console.log("Auth status updated:", isAuthenticated);
  }, [isAuthenticated]);

  return (
    <>
      <Header />
      <Routes>
        <Route
          path="/"
          element={isAuthenticated ? <TournamentsPages /> : <Login />}
        />
        <Route
          path="/login"
          element={!isAuthenticated ? <Login /> : <Navigate to="/" replace />}
        />
        <Route
          path="/register"
          element={!isAuthenticated ? <Register /> : <Navigate to="/" replace />}
        />
        <Route
          path="/social-login"
          element={!isAuthenticated ? <SocialLogin /> : <Navigate to="/" replace />}
        />
        <Route
          path="/tournament/create"
          element={
            isAuthenticated ? <TournamentForm /> : <Navigate to="/login" replace />
          }
        />
        <Route
          path="/tournament-form"
          element={
            isAuthenticated ? <TournamentForm /> : <Navigate to="/login" replace />
          }
        />
        <Route path="/tournaments" element={<TournamentsPages />} />

        {/* Tournament-related routes wrapped in TournamentLayout */}
        <Route path="/tournaments/:id" element={<TournamentLayout />}>
          <Route index element={<TournamentDetails />} />
          <Route path="entry" element={<Entry />} />
          <Route path="tie-sheet" element={<TieSheet />} />
          <Route path="tie-sheet-record" element={<TieSheetRecord />} />
          <Route path="winner" element={<Winner />} />
          <Route path="team-championship" element={<TeamChampionship />} />
          <Route path="official" element={<Official />} />
          <Route path="team" element={<Team />} />
        </Route>

        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="*" element={<h1>404 - Page Not Found</h1>} />
      </Routes>
    </>
  );
}

export default App;