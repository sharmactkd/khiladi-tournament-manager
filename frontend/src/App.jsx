import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Header from "./components/Header";
import Footer from "./components/Footer";
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
import TeamEntryForm from "./pages/TeamEntryForm";
import TeamSubmissions from "./pages/TeamSubmissions";
import TournamentLayout from "./components/TournamentLayout";
import SocialAuthSuccess from "./pages/SocialAuthSuccess";
import "./App.css";

function App() {
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    console.log("Auth status updated:", isAuthenticated);
  }, [isAuthenticated]);

  return (
    <div className="appLayout">
      <Header />

      <main className="mainContent">
        <Routes>
          <Route path="/" element={<TournamentsPages />} />

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

          <Route
            path="/team-entry/:id"
            element={
              isAuthenticated ? (
                <TeamEntryForm />
              ) : (
                <Navigate
                  to={`/login?redirect=${encodeURIComponent(window.location.pathname)}`}
                  replace
                />
              )
            }
          />
<Route path="/auth/social-success" element={<SocialAuthSuccess />} />
          <Route path="/tournaments/:id" element={<TournamentLayout />}>
            <Route index element={<TournamentDetails />} />
            <Route path="entry" element={<Entry />} />
            <Route path="tie-sheet" element={<TieSheet />} />
            <Route path="tie-sheet-record" element={<TieSheetRecord />} />
            <Route path="winner" element={<Winner />} />
            <Route path="team-championship" element={<TeamChampionship />} />
            <Route path="official" element={<Official />} />
            <Route path="team" element={<Team />} />
            <Route
              path="team-submissions"
              element={
                isAuthenticated && user?.role === "organizer" ? (
                  <TeamSubmissions />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
          </Route>

          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<h1>404 - Page Not Found</h1>} />
        </Routes>
      </main>

      <Footer />
    </div>
  );
}

export default App;