import React from "react";

function AccessDenied() {
  return (
    <div className="access-denied">
      <i className="ri-lock-2-line"></i>
      <h1>Access Denied</h1>
      <p>You do not have permission to view this page.</p>
    </div>
  );
}

export default AccessDenied;
