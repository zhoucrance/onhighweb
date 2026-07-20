import "antd/dist/antd.min.css";
import "./resourses/global.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import PublicRoute from "./components/PublicRoute";
import ProtectedRoute from "./components/ProtectedRoute";
import Loader from "./components/Loader";
import { useSelector } from "react-redux";
import AdminHome from "./pages/Admin/AdminHome";
import AdminBuses from "./pages/Admin/AdminBuses";
import AdminUsers from "./pages/Admin/AdminUsers";
import BookNow from "./pages/BookNow";
import Bookings from "./pages/Bookings";
import AdminBookingManagement from "./pages/Admin/AdminBookingManagement";
import AdminRoutes from "./pages/Admin/AdminRoutes";
import AdminTrips from "./pages/Admin/AdminTrips";
import AdminSeatAvailability from "./pages/Admin/AdminSeatAvailability";
import AdminServiceFees from "./pages/Admin/AdminServiceFees";
import AdminHelpDesk from "./pages/Admin/AdminHelpDesk";
import AdminPesepaySettings from "./pages/Admin/AdminPesepaySettings";
import AccessDenied from "./pages/AccessDenied";
import { hasPermission, isSuperAdmin } from "./helpers/permissions";

function PermissionRoute({ children, permission, superAdminOnly = false }) {
  const { user } = useSelector((state) => state.users);
  if (superAdminOnly && !isSuperAdmin(user)) {
    console.error("[PermissionRoute] Access denied", {
      path: window.location.pathname,
      reason: "super_admin_required",
      user,
    });
    return <AccessDenied />;
  }
  if (permission && !hasPermission(user, permission)) {
    console.error("[PermissionRoute] Access denied", {
      path: window.location.pathname,
      permission,
      user,
    });
    return <AccessDenied />;
  }
  return children;
}

function App() {
  const { loading } = useSelector((state) => state.alerts);
  return (
    <div>
      {loading && <Loader />}
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route
            path="/book-now/:id"
            element={
              <ProtectedRoute>
                <BookNow />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookings"
            element={
              <ProtectedRoute>
                <Bookings />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute>
                <PermissionRoute permission="dashboard">
                  <AdminHome />
                </PermissionRoute>
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/buses"
            element={
              <ProtectedRoute>
                <AdminBuses />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/routes"
            element={
              <ProtectedRoute>
                <AdminRoutes />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/trips"
            element={
              <ProtectedRoute>
                <PermissionRoute permission="trips">
                  <AdminTrips />
                </PermissionRoute>
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/users"
            element={
              <ProtectedRoute>
                <PermissionRoute permission="users">
                  <AdminUsers />
                </PermissionRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/bookings"
            element={
              <ProtectedRoute>
                <Bookings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/booking-management"
            element={
              <ProtectedRoute>
                <AdminBookingManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/seat-availability"
            element={
              <ProtectedRoute>
                <AdminSeatAvailability />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/service-fees"
            element={
              <ProtectedRoute>
                <PermissionRoute superAdminOnly>
                  <AdminServiceFees />
                </PermissionRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pesepay-settings"
            element={
              <ProtectedRoute>
                <PermissionRoute superAdminOnly>
                  <AdminPesepaySettings />
                </PermissionRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/help-desk"
            element={
              <ProtectedRoute>
                <PermissionRoute permission="help_desk">
                  <AdminHelpDesk />
                </PermissionRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/register"
            element={
              <PublicRoute>
                <Register />
              </PublicRoute>
            }
          />
          <Route
            path="/login"
            element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
