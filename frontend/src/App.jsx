import React, { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Header from "./components/Header";
import Footer from "./components/Footer";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import CompleteProfile from "./pages/CompleteProfile";
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
import AdminLayout from "./pages/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminUserDetails from "./pages/admin/AdminUserDetails";
import AdminTournaments from "./pages/admin/AdminTournaments";
import AdminTournamentDetails from "./pages/admin/AdminTournamentDetails";
import AdminPayments from "./pages/admin/AdminPayments";
import AdminEntries from "./pages/admin/AdminEntries";
import "./App.css";

function App() {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  const needsProfileCompletion =
    isAuthenticated &&
    user?.loginProvider === "google" &&
    user?.isProfileComplete === false;

  const isAdminUser = user?.role === "admin" || user?.role === "superadmin";

  const requireAuth = (element) => {
    if (!isAuthenticated) {
      return (
        <Navigate
          to={`/login?redirect=${encodeURIComponent(location.pathname)}`}
          replace
        />
      );
    }

    if (needsProfileCompletion) {
      return <Navigate to="/complete-profile" replace />;
    }

    return element;
  };

  const requireAdmin = (element) => {
    if (!isAuthenticated) {
      return (
        <Navigate
          to={`/login?redirect=${encodeURIComponent(location.pathname)}`}
          replace
        />
      );
    }

    if (needsProfileCompletion) {
      return <Navigate to="/complete-profile" replace />;
    }

    if (!isAdminUser) {
      return <Navigate to="/" replace />;
    }

    return element;
  };

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
            element={
              !isAuthenticated ? (
                <Login />
              ) : needsProfileCompletion ? (
                <Navigate to="/complete-profile" replace />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />

          <Route
            path="/register"
            element={
              !isAuthenticated ? (
                <Register />
              ) : needsProfileCompletion ? (
                <Navigate to="/complete-profile" replace />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />

          <Route
            path="/forgot-password"
            element={
              !isAuthenticated ? (
                <ForgotPassword />
              ) : needsProfileCompletion ? (
                <Navigate to="/complete-profile" replace />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />

          <Route
            path="/reset-password/:token"
            element={
              !isAuthenticated ? (
                <ResetPassword />
              ) : needsProfileCompletion ? (
                <Navigate to="/complete-profile" replace />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />

          <Route
            path="/complete-profile"
            element={
              isAuthenticated ? (
                needsProfileCompletion ? (
                  <CompleteProfile />
                ) : (
                  <Navigate to="/" replace />
                )
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

          <Route
            path="/social-login"
            element={!isAuthenticated ? <SocialLogin /> : <Navigate to="/" replace />}
          />

          <Route
            path="/tournament/create"
            element={requireAuth(<TournamentForm />)}
          />

          <Route
            path="/tournament-form"
            element={requireAuth(<TournamentForm />)}
          />

          <Route path="/tournaments" element={<TournamentsPages />} />

          <Route
            path="/team-entry/:id"
            element={requireAuth(<TeamEntryForm />)}
          />

          <Route path="/admin" element={requireAdmin(<AdminLayout />)}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="users/:userId" element={<AdminUserDetails />} />
            <Route path="tournaments" element={<AdminTournaments />} />
            <Route path="tournaments/:tournamentId" element={<AdminTournamentDetails />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="entries" element={<AdminEntries />} />
          </Route>

          <Route
            path="/tournaments/:id"
            element={
              needsProfileCompletion ? (
                <Navigate to="/complete-profile" replace />
              ) : (
                <TournamentLayout />
              )
            }
          >
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
                isAuthenticated &&
                !needsProfileCompletion &&
                user?.role === "organizer" ? (
                  <TeamSubmissions />
                ) : needsProfileCompletion ? (
                  <Navigate to="/complete-profile" replace />
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