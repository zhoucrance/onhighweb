import { message } from "antd";
import axios from "axios";
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { HideLoading, ShowLoading } from "../redux/alertsSlice";
import { SetUser } from "../redux/usersSlice";
import DefaultLayout from "./DefaultLayout";
import { getUserRole, getUserPermissions } from "../helpers/permissions";
import { useAppStore } from "../store/useAppStore";

function ProtectedRoute({ children, publicFallback = null }) {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.users);
  const setAuthState = useAppStore((state) => state.setAuthState);
  const clearAuthState = useAppStore((state) => state.clearAuthState);
  const [showPublicFallback, setShowPublicFallback] = useState(
    !localStorage.getItem("token") && Boolean(publicFallback)
  );

  const navigate = useNavigate();

  const rejectSession = (errorMessage) => {
    localStorage.removeItem("token");
    clearAuthState();
    if (errorMessage) {
      message.error(errorMessage);
    }
    if (publicFallback) {
      setShowPublicFallback(true);
    } else {
      navigate("/login");
    }
  };

  const validateToken = async () => {
    try {
      dispatch(ShowLoading());
      const response = await axios.post(
        "/api/users/get-user-by-id",
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
      dispatch(HideLoading());
      if (response.data.success) {
        dispatch(SetUser(response.data.data));
        setAuthState(response.data.data);
      } else {
        rejectSession(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      rejectSession(error.message);
    }
  };

  useEffect(() => {
    if (localStorage.getItem("token")) {
      validateToken();
    } else if (!publicFallback) {
      navigate("/login");
    }
  }, []);

  useEffect(() => {
    if (window.location.pathname.includes("admin")) {
      const hasAdminAccess =
        user?.isAdmin ||
        getUserRole(user) === "SUPER_ADMIN" ||
        getUserRole(user) === "COMPANY_ADMIN" ||
        getUserPermissions(user).length > 0;
      if (!hasAdminAccess) {
        message.error("You are not authorized to access this page");
        window.location.href = "/";
      }
    }
  }, [user]);

  if (showPublicFallback) {
    return publicFallback;
  }

  return <div>{user !== null && <DefaultLayout>{children}</DefaultLayout>}</div>;
}

export default ProtectedRoute;
