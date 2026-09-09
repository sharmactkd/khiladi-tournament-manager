// FILE: frontend/src/App.jsx

import React, { Suspense, lazy } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";

import Header from "./components/Header";
import Footer from "./components/Footer";
import PremiumAccessGuard from "./components/PremiumAccessGuard";

import "./App.css";

const PageLoader = () => (
  <div
    className="loading"
    style={{
      minHeight: "50vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "1.2rem",
    }}
  >
    Loading...
  </div>
);

const TournamentLayout = lazy(() => import("./components/TournamentLayout"));

const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const CompleteProfile = lazy(() => import("./pages/CompleteProfile"));

const TournamentsPages = lazy(() => import("./pages/TournamentsPages"));
const TournamentForm = lazy(() => import("./pages/TournamentForm"));
const TournamentDetails = lazy(() => import("./pages/TournamentDetails"));
const SocialLogin = lazy(() => import("./pages/SocialLogin"));
const SsoCallback = lazy(() => import("./pages/SsoCallback"));
const TournamentManager = lazy(() => import("./pages/TournamentManager"));
const BracketMaker = lazy(() => import("./pages/BracketMaker"));
const TieSheetMaker = lazy(() => import("./pages/TieSheetMaker"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));

const Entry = lazy(() => import("./pages/Entry"));
const TieSheet = lazy(() => import("./pages/TieSheet"));
const TieSheetRecord = lazy(() => import("./pages/TieSheetRecord"));
const Winner = lazy(() => import("./pages/Winner"));
const TeamChampionship = lazy(() => import("./pages/TeamChampionship"));
const Official = lazy(() => import("./pages/Official"));
const Team = lazy(() => import("./pages/Team"));
const TeamEntryForm = lazy(() => import("./pages/TeamEntryForm"));
const TeamSubmissions = lazy(() => import("./pages/TeamSubmissions"));
const MyPlan = lazy(() => import("./pages/MyPlan"));

const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminUserDetails = lazy(() => import("./pages/admin/AdminUserDetails"));
const AdminTournaments = lazy(() => import("./pages/admin/AdminTournaments"));
const AdminTournamentDetails = lazy(() =>
  import("./pages/admin/AdminTournamentDetails")
);
const AdminPayments = lazy(() => import("./pages/admin/AdminPayments"));
const AdminEntries = lazy(() => import("./pages/admin/AdminEntries"));
const BillingDashboard = lazy(() => import("./pages/admin/BillingDashboard"));
const BillingSettings = lazy(() => import("./pages/admin/BillingSettings"));
const UserAccessManager = lazy(() => import("./pages/admin/UserAccessManager"));
const CouponManager = lazy(() => import("./pages/admin/CouponManager"));
const Transactions = lazy(() => import("./pages/admin/Transactions"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));

function App() {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  const needsProfileCompletion =
    isAuthenticated &&
    user?.loginProvider === "google" &&
    user?.isProfileComplete === false;

  const isAdminUser = user?.role === "admin" || user?.role === "superadmin";

  const loginRedirect = (
    <Navigate
      to={`/login?redirect=${encodeURIComponent(location.pathname)}`}
      replace
    />
  );

  const requireAuth = (element) => {
    if (loading) return <PageLoader />;
    if (!isAuthenticated) return loginRedirect;
    if (needsProfileCompletion) {
      return <Navigate to="/complete-profile" replace />;
    }
    return element;
  };

  const requireAdmin = (element) => {
    if (loading) return <PageLoader />;
    if (!isAuthenticated) return loginRedirect;
    if (needsProfileCompletion) {
      return <Navigate to="/complete-profile" replace />;
    }
    if (!isAdminUser) return <Navigate to="/" replace />;
    return element;
  };

  const requireTournamentLogin = (element) => {
    if (loading) return <PageLoader />;
    if (!isAuthenticated) return loginRedirect;
    if (needsProfileCompletion) {
      return <Navigate to="/complete-profile" replace />;
    }
    return element;
  };

  const requirePremiumTournamentFeature = (element, featureLabel, feature) =>
    requireTournamentLogin(
      <PremiumAccessGuard featureLabel={featureLabel} feature={feature}>
        {element}
      </PremiumAccessGuard>
    );

  return (
    <div className="appLayout">
      <Header />

      <main className="mainContent">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/auth/sso/callback" element={<SsoCallback />} />
            <Route path="/" element={<TournamentsPages />} />
            <Route path="/tournaments" element={<TournamentsPages />} />

            <Route path="/tournament-manager" element={<TournamentManager />} />
            <Route path="/bracket-maker" element={<BracketMaker />} />
            <Route path="/tie-sheet-maker" element={<TieSheetMaker />} />

            <Route
              path="/login"
              element={
                loading ? (
                  <PageLoader />
                ) : !isAuthenticated ? (
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
                loading ? (
                  <PageLoader />
                ) : !isAuthenticated ? (
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
                loading ? (
                  <PageLoader />
                ) : !isAuthenticated ? (
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
                loading ? (
                  <PageLoader />
                ) : !isAuthenticated ? (
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
                loading ? (
                  <PageLoader />
                ) : isAuthenticated ? (
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
              element={
                loading ? (
                  <PageLoader />
                ) : !isAuthenticated ? (
                  <SocialLogin />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />

            <Route
              path="/tournament/create"
              element={requireAuth(<TournamentForm />)}
            />
            <Route
              path="/tournament-form"
              element={requireAuth(<TournamentForm />)}
            />

            <Route path="/my-plan" element={requireAuth(<MyPlan />)} />

            <Route
              path="/team-entry/:id"
              element={requireAuth(<TeamEntryForm />)}
            />

            <Route path="/admin" element={requireAdmin(<AdminLayout />)}>
              <Route index element={<AdminDashboard />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="users/:userId" element={<AdminUserDetails />} />
              <Route path="tournaments" element={<AdminTournaments />} />
              <Route
                path="tournaments/:tournamentId"
                element={<AdminTournamentDetails />}
              />
              <Route path="payments" element={<AdminPayments />} />
              <Route path="entries" element={<AdminEntries />} />

              <Route path="billing" element={<BillingDashboard />} />
              <Route path="billing/users" element={<UserAccessManager />} />
              <Route path="billing/settings" element={<BillingSettings />} />
              <Route path="billing/coupons" element={<CouponManager />} />
              <Route path="billing/transactions" element={<Transactions />} />
              <Route path="billing/audit-logs" element={<AuditLogs />} />
            </Route>

            <Route
              path="/tournaments/:id"
              element={
                loading ? (
                  <PageLoader />
                ) : needsProfileCompletion ? (
                  <Navigate to="/complete-profile" replace />
                ) : (
                  <TournamentLayout />
                )
              }
            >
              <Route index element={<TournamentDetails />} />

              <Route path="entry" element={requireTournamentLogin(<Entry />)} />

              <Route
                path="tie-sheet"
                element={requirePremiumTournamentFeature(
                  <TieSheet />,
                  "Tie Sheet",
                  "tiesheet"
                )}
              />

              <Route
                path="tie-sheet-record"
                element={requirePremiumTournamentFeature(
                  <TieSheetRecord />,
                  "Tie Sheet Record",
                  "tiesheet_record"
                )}
              />

              <Route
                path="winner"
                element={requirePremiumTournamentFeature(
                  <Winner />,
                  "Winner",
                  "winner"
                )}
              />

              <Route
                path="team-championship"
                element={requirePremiumTournamentFeature(
                  <TeamChampionship />,
                  "Team Championship",
                  "team_championship"
                )}
              />

              <Route
                path="official"
                element={requirePremiumTournamentFeature(
                  <Official />,
                  "Officials",
                  "officials"
                )}
              />

              <Route
                path="team"
                element={requirePremiumTournamentFeature(
                  <Team />,
                  "Team Payments",
                  "team_payments"
                )}
              />

              <Route
                path="team-submissions"
                element={requireTournamentLogin(<TeamSubmissions />)}
              />
            </Route>

            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />

            <Route path="*" element={<h1>404 - Page Not Found</h1>} />
          </Routes>
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}

export default App;
