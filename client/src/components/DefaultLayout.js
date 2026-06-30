import React from "react";
import "../resourses/layout.css";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { hasPermission, isSuperAdmin } from "../helpers/permissions";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { useAppStore } from "../store/useAppStore";
import AuditNotifications from "./AuditNotifications";

function DefaultLayout({ children }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const { user } = useSelector((state) => state.users);
  const clearAuthState = useAppStore((state) => state.clearAuthState);
  const userMenu = [
    {
      name: "Home",
      icon: "ri-home-line",
      path: "/",
    },
    {
      name: "Bookings",
      icon: "ri-file-list-line",
      path: "/bookings",
    },
    {
      name: "Profile",
      icon: "ri-user-line",
      path: "/profile",
    },
    {
      name: "Logout",
      icon: "ri-logout-box-line",
      path: "/logout",
    },
  ];
  const adminMenu = [
    {
      name: "Home",
      path: "/",
      icon: "ri-home-line",
    },
    {
      name: "Dashboard",
      path: "/admin/dashboard",
      icon: "ri-dashboard-line",
      permission: "dashboard",
    },
    {
      name: "Buses",
      path: "/admin/buses",
      icon: "ri-bus-line",
      permission: "buses",
    },
    {
      name: "Service Fee",
      path: "/admin/service-fees",
      icon: "ri-price-tag-3-line",
      superAdminOnly: true,
    },
    {
      name: "Routes",
      path: "/admin/routes",
      icon: "ri-route-line",
      permission: "routes",
    },
    {
      name: "Trips",
      path: "/admin/trips",
      icon: "ri-calendar-line",
      permission: "trips",
    },
    {
      name: "Users",
      path: "/admin/users",
      icon: "ri-user-line",
      permission: "users",
    },
    {
      name: "Bookings",
      path: "/bookings",
      icon: "ri-file-list-line",
    },
    {
      name: "Booking Management",
      path: "/admin/booking-management",
      icon: "ri-ticket-2-line",
      permission: "booking_management",
    },
    {
      name: "Seats",
      path: "/admin/seat-availability",
      icon: "ri-dashboard-3-line",
      permission: "seats",
    },
    {
      name: "Logout",
      path: "/logout",
      icon: "ri-logout-box-line",
    },
  ];
  const canSeeMenuItem = (item) => {
    if (item.superAdminOnly) return isSuperAdmin(user);
    if (item.permission) return hasPermission(user, item.permission);
    return true;
  };
  const menuToBeRendered = user?.isAdmin || user?.role ? adminMenu.filter(canSeeMenuItem) : userMenu;
  const companyName =
    user?.companyId?.companyName ||
    user?.company?.companyName ||
    user?.companyName ||
    "OnhighBus";
  const companyInitials = companyName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase() || "OB";
  let activeRoute = window.location.pathname;
  if(window.location.pathname.includes('book-now'))
  {
    activeRoute = "/";
  }

  const handleNavigate = (item) => {
    setMobileMenuOpen(false);
    if (item.path === "/logout") {
      localStorage.removeItem("token");
      clearAuthState();
      navigate("/login");
    } else {
      navigate(item.path);
    }
  };

  const renderMenu = (isMobile = false) => (
    <div className="d-flex flex-column gap-3 justify-content-start menu">
      {menuToBeRendered.map((item) => {
        return (
          <div
            key={item.path}
            className={`${activeRoute === item.path ? "active-menu-item" : ""} menu-item`}
            onClick={() => handleNavigate(item)}
          >
            <i className={item.icon}></i>
            {(!collapsed || isMobile) && <span>{item.name}</span>}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="layout-parent">
      <div className={`sidebar desktop-sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand-row">
            <h1 className="logo" title={companyName}>
              {collapsed ? companyInitials : companyName}
            </h1>
            <button
              type="button"
              className="sidebar-collapse-button"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand menu" : "Collapse menu"}
              title={collapsed ? "Expand menu" : "Collapse menu"}
            >
              <i className={collapsed ? "ri-arrow-right-s-line" : "ri-arrow-left-s-line"}></i>
            </button>
          </div>
          {!collapsed && (
            <h1 className="role">
              {user?.name} <br />
              Role : {user?.isAdmin ? "Admin" : "User"}
            </h1>
          )}
        </div>
        {renderMenu(false)}
      </div>
      <div className="body">
        <div className="header">
          <div className="mobile-header-brand">
            <button
              type="button"
              className="mobile-menu-button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <i className="ri-menu-2-fill"></i>
              <span>Menu</span>
            </button>
            <div className="mobile-company-name">
              <strong>{companyName}</strong>
              <span>{user?.name || "Account"}</span>
            </div>
          </div>
          {collapsed ? (
            <i
              className="ri-menu-2-fill desktop-collapse-button"
              onClick={() => setCollapsed(!collapsed)}
            ></i>
          ) : (
            <i
              className="ri-close-line desktop-collapse-button"
              onClick={() => setCollapsed(!collapsed)}
            ></i>
          )}
          <AuditNotifications user={user} />
        </div>
        <div className="content">{children}</div>
      </div>
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{companyName}</SheetTitle>
            <p className="mobile-role">
              {user?.name} <br />
              Role : {user?.isAdmin ? "Admin" : "User"}
            </p>
          </SheetHeader>
          {renderMenu(true)}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default DefaultLayout;
