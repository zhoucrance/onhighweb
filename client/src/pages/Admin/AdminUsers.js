import { Form, Input, message, Modal, Select } from "antd";
import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useDispatch } from "react-redux";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import PageTitle from "../../components/PageTitle";
import ResponsiveAntTable from "../../components/ResponsiveAntTable";
import { axiosInstance } from "../../helpers/axiosInstance";
import { getUserPermissions, getUserRoleLevel, isSuperAdmin, modulePermissions } from "../../helpers/permissions";
import { getOfflineSnapshot, saveOfflineSnapshot } from "../../lib/offlineDb";
import { HideLoading, ShowLoading } from "../../redux/alertsSlice";

const getUsersSnapshotKey = (currentUser) => {
  const userId = currentUser?._id || "unknown";
  const companyId = currentUser?.companyId?._id || currentUser?.companyId || "global";
  return `admin_users:${companyId}:${userId}`;
};

const fetchUsers = async (currentUser) => {
  const snapshotKey = getUsersSnapshotKey(currentUser);
  try {
    console.info("[AdminUsers] Loading users", {
      currentUser,
    });
    const response = await axiosInstance.post("/api/users/get-all-users", {});
    console.info("[AdminUsers] Users API response", response.data);
    if (!response.data.success) {
      console.error("[AdminUsers] Users API returned failure", response.data);
      throw new Error(response.data.message);
    }
    await saveOfflineSnapshot(snapshotKey, response.data.data);
    return response.data.data;
  } catch (error) {
    console.error("[AdminUsers] Users API error", {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      currentUser,
    });
    const offlineUsers = await getOfflineSnapshot(snapshotKey);
    if (offlineUsers) return offlineUsers;
    throw error;
  }
};

const fetchAssignableBuses = async () => {
  const response = await axiosInstance.post("/api/buses/get-all-buses", {});
  if (!response.data.success) {
    throw new Error(response.data.message);
  }
  return response.data.data || [];
};

const getRoleLabel = (data) => {
  if (data?.role === "SUPER_ADMIN" || data?.isAdmin) return "Super Admin";
  if (data?.role === "COMPANY_ADMIN") return "Admin";
  return "User";
};

const getStaffTitleLabel = (data) => {
  if (data?.staffTitle === "CONDUCTOR") return "Conductor";
  if (data?.staffTitle === "OFFICE_BOOKING") return "Office Booking";
  return "";
};

function AdminUsers() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.users);
  const queryClient = useQueryClient();

  const [showCreateUser, setShowCreateUser] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [nameSearch, setNameSearch] = useState("");
  const [roleSearch, setRoleSearch] = useState("ALL");
  const [createUserForm] = Form.useForm();
  const selectedRole = Form.useWatch("role", createUserForm);
  const selectedStaffTitle = Form.useWatch("staffTitle", createUserForm);
  const superAdmin = isSuperAdmin(user);
  const currentUserId = String(user?._id || "");
  const currentRoleLevel = getUserRoleLevel(user);
  const assignablePermissions = superAdmin
    ? modulePermissions
    : getUserPermissions(user).filter((permission) => permission !== "service_fee");

  const {
    data: users = [],
    isFetching: usersFetching,
    error: usersError,
  } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(user),
    enabled: Boolean(user),
  });

  const filteredUsers = useMemo(() => {
    const nameTerm = nameSearch.trim().toLowerCase();
    const roleTerm = roleSearch === "ALL" ? "" : roleSearch.trim().toLowerCase();

    return users.filter((record) => {
      const nameText = [
        record.name,
        record.fullName,
      ].filter(Boolean).join(" ").toLowerCase();
      const roleText = [
        record.role,
        getRoleLabel(record),
        record.staffTitle,
        getStaffTitleLabel(record),
      ].filter(Boolean).join(" ").toLowerCase();

      const matchesName = !nameTerm || nameText.includes(nameTerm);
      const matchesRole = !roleTerm || roleText.includes(roleTerm);
      return matchesName && matchesRole;
    });
  }, [nameSearch, roleSearch, users]);

  const {
    data: buses = [],
    isFetching: busesFetching,
  } = useQuery({
    queryKey: ["admin-users-assignable-buses"],
    queryFn: fetchAssignableBuses,
    enabled: Boolean(
      showCreateUser &&
      selectedRole === "STAFF" &&
      ["CONDUCTOR", "OFFICE_BOOKING"].includes(selectedStaffTitle)
    ),
  });

  const createUserMutation = useMutation({
    mutationFn: (payload) => axiosInstance.post("/api/users", payload),
    onSuccess: (response) => {
      if (response.data.success) {
        message.success(response.data.message);
        setShowCreateUser(false);
        createUserForm.resetFields();
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      } else {
        message.error(response.data.message);
      }
    },
    onError: (error) => {
      message.error(error.response?.data?.message || error.message);
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, payload }) => axiosInstance.patch(`/api/users/${id}`, payload),
    onSuccess: (response) => {
      if (response.data.success) {
        message.success(response.data.message);
        setEditingUser(null);
        createUserForm.resetFields();
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      } else {
        message.error(response.data.message);
      }
    },
    onError: (error) => {
      message.error(error.response?.data?.message || error.message);
    },
  });

  const userActionMutation = useMutation({
    mutationFn: (payload) => axiosInstance.post("/api/users/update-user-permissions", payload),
    onSuccess: (response) => {
      if (response.data.success) {
        queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        message.success(response.data.message);
      } else {
        message.error(response.data.message);
      }
    },
    onError: (error) => {
      message.error(error.response?.data?.message || error.message);
    },
  });

  const canManageRecord = (record) => {
    const isSelf = String(record?._id || "") === currentUserId;
    if (isSelf) return false;
    if (superAdmin) return true;
    return currentRoleLevel > getUserRoleLevel(record);
  };

  const createUser = async (values) => {
    const payload = {
      ...values,
      isAdmin: superAdmin && values.role === "SUPER_ADMIN",
      permissions: values.permissions || [],
    };
    if (!superAdmin) {
      payload.role = "STAFF";
    }
    createUserMutation.mutate(payload);
  };

  const saveEditedUser = async (values) => {
    if (!editingUser) return;
    const payload = {
      name: values.name,
      fullName: values.name,
      email: values.email,
      phone: values.phone,
      role: superAdmin ? values.role : "STAFF",
      isAdmin: superAdmin && values.role === "SUPER_ADMIN",
      companyName: values.companyName,
      staffTitle: values.staffTitle || "",
      assignedBus: values.staffTitle === "CONDUCTOR" ? values.assignedBus : null,
      assignedBuses: values.staffTitle === "OFFICE_BOOKING" ? values.assignedBuses || [] : [],
      permissions: values.permissions || [],
      isBlocked: editingUser.isBlocked,
      isActive: editingUser.isActive,
    };
    updateUserMutation.mutate({ id: editingUser._id, payload });
  };

  const openEditUser = (record) => {
    setEditingUser(record);
    createUserForm.setFieldsValue({
      name: record.name || record.fullName,
      email: record.email,
      phone: record.phone,
      role: record.role || (record.isAdmin ? "SUPER_ADMIN" : "STAFF"),
      companyName: record.companyId?.companyName || record.companyName || "",
      staffTitle: record.staffTitle || "",
      assignedBus: record.assignedBus?._id || record.assignedBus || undefined,
      assignedBuses: (record.assignedBuses || []).map((bus) => bus?._id || bus).filter(Boolean),
      permissions: record.permissions || [],
      password: undefined,
    });
    setShowCreateUser(true);
  };

  const updateUserPermissions = async (user, action) => {
    try {
      let payload = null;
      if (action === "make-admin") {
        payload = {
          ...user,
          isAdmin: true,
          role: "SUPER_ADMIN",
        };
      } else if (action === "remove-admin") {
        payload = {
          ...user,
          isAdmin: false,
          role: "STAFF",
        };
      } else if (action === "block") {
        payload = {
          ...user,
          isBlocked: true,
        };
      } else if (action === "unblock") {
        payload = {
          ...user,
          isBlocked: false,
        };
      }

      userActionMutation.mutate(payload);
    } catch (error) {
      message.error(error.message);
    }
  };

  const confirmUserAction = (user, action, label) => {
    Modal.confirm({
      title: `${label}?`,
      content: `Please confirm this change for ${user.name}.`,
      okText: "Confirm",
      cancelText: "Cancel",
      onOk: () => updateUserPermissions(user, action),
    });
  };

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
    },
    {
      title: "Email",
      dataIndex: "email",
    },
    {
      title: "Status",
      dataIndex: "",
      render: (_, data) => {
        return data.isBlocked ? "Blocked" : "Active";
      },
    },
    {
      title: "Role",
      dataIndex: "",
      render: (_, data) => {
        return getRoleLabel(data);
      },
    },
    {
      title: "Title",
      dataIndex: "",
      render: (_, data) => {
        return getStaffTitleLabel(data) || "-";
      },
    },
    {
      title: "Assigned Bus",
      dataIndex: "",
      render: (_, data) => {
        if (data?.staffTitle === "OFFICE_BOOKING") {
          return (data.assignedBuses || []).map((bus) => bus?.name || bus?.number).filter(Boolean).join(", ") || "-";
        }
        return data?.assignedBus?.name || data?.assignedBus?.number || "-";
      },
    },
    {
      title: "Action",
      dataIndex: "action",
      render: (action, record) => (
        canManageRecord(record) ? (
          <div className="d-flex gap-3">
          {record?.isBlocked && (
            <p
              className="underline"
              onClick={() => confirmUserAction(record, "unblock", "Unblock user")}
            >
              UnBlock
            </p>
          )}
          {!record?.isBlocked && (
            <p
              className="underline"
              onClick={() => confirmUserAction(record, "block", "Block user")}
            >
              Block
            </p>
          )}
          {superAdmin && record?.isAdmin && (
            <p
              className="underline"
              onClick={() =>
                confirmUserAction(record, "remove-admin", "Remove admin permissions")
              }
            >
              Remove Admin
            </p>
          )}
          {superAdmin && !record?.isAdmin && (
            <p
              className="underline"
              onClick={() => confirmUserAction(record, "make-admin", "Make user Super Admin")}
            >
              Make Admin
            </p>
          )}
          <p className="underline" onClick={() => openEditUser(record)}>
            Edit
          </p>
        </div>
        ) : (
          <span>-</span>
        )
      ),
    },
  ];

  useEffect(() => {
    console.info("[AdminUsers] Page mounted", {
      currentUser: user,
    });
  }, []);

  useEffect(() => {
    const loading =
      usersFetching ||
      busesFetching ||
      createUserMutation.isPending ||
      updateUserMutation.isPending ||
      userActionMutation.isPending;
    dispatch(loading ? ShowLoading() : HideLoading());
  }, [
    usersFetching,
    busesFetching,
    createUserMutation.isPending,
    updateUserMutation.isPending,
    userActionMutation.isPending,
    dispatch,
  ]);

  useEffect(() => {
    if (usersError) {
      message.error(usersError.response?.data?.message || usersError.message);
    }
  }, [usersError]);
  return (
    <div>
      <div className="d-flex justify-content-between my-2">
        <PageTitle title="Users" />
        <button
          className="primary-btn"
          onClick={() => {
            createUserForm.setFieldsValue({
              role: superAdmin ? "STAFF" : "STAFF",
              staffTitle: "",
              assignedBus: undefined,
              assignedBuses: [],
              permissions: [],
            });
            setEditingUser(null);
            setShowCreateUser(true);
          }}
        >
          Add User
        </button>
      </div>

      <div className="admin-filter-bar admin-users-filter-bar">
        <Input
          allowClear
          placeholder="Search by user name"
          value={nameSearch}
          onChange={(event) => setNameSearch(event.target.value)}
        />
        <Select
          placeholder="Search by role"
          value={roleSearch}
          onChange={(value) => setRoleSearch(value || "ALL")}
        >
          <Select.Option value="ALL">All roles</Select.Option>
          <Select.Option value="SUPER_ADMIN">Super Admin</Select.Option>
          <Select.Option value="COMPANY_ADMIN">Admin</Select.Option>
          <Select.Option value="STAFF">User</Select.Option>
          <Select.Option value="CONDUCTOR">Conductor</Select.Option>
          <Select.Option value="OFFICE_BOOKING">Office Booking</Select.Option>
        </Select>
      </div>

      <ResponsiveAntTable columns={columns} dataSource={filteredUsers} rowKey="_id" cardsAlways />

      <Modal
        title={editingUser ? "Edit User" : "Create User"}
        visible={showCreateUser}
        onCancel={() => {
          setShowCreateUser(false);
          setEditingUser(null);
          createUserForm.resetFields();
        }}
        footer={false}
        width={720}
      >
        <Form
          form={createUserForm}
          layout="vertical"
          onFinish={editingUser ? saveEditedUser : createUser}
          initialValues={{
            role: "STAFF",
            permissions: [],
          }}
        >
          <div className="row">
            <div className="col-md-6">
              <Form.Item label="Name" name="name" rules={[{ required: true, message: "Name is required" }]}>
                <Input placeholder="Full name" />
              </Form.Item>
            </div>
            <div className="col-md-6">
              <Form.Item label="Email" name="email" rules={[{ required: true, message: "Email is required" }]}>
                <Input placeholder="name@example.com" />
              </Form.Item>
            </div>
            <div className="col-md-6 mt-3">
              <Form.Item label="Phone" name="phone">
                <Input placeholder="Phone number" />
              </Form.Item>
            </div>
            <div className="col-md-6 mt-3">
              <Form.Item
                label={editingUser ? "Password" : "Password"}
                name="password"
                rules={editingUser ? [] : [{ required: true, message: "Password is required" }]}
              >
                <Input.Password placeholder={editingUser ? "Leave blank to keep current password" : "Temporary password"} disabled={editingUser} />
              </Form.Item>
            </div>
            <div className="col-md-6 mt-3">
              <Form.Item label="Role" name="role" rules={[{ required: true }]}>
                <Select disabled={!superAdmin}>
                  {superAdmin && <Select.Option value="SUPER_ADMIN">Super Admin</Select.Option>}
                  {superAdmin && <Select.Option value="COMPANY_ADMIN">Company Admin</Select.Option>}
                  <Select.Option value="STAFF">Staff/User</Select.Option>
                </Select>
              </Form.Item>
            </div>
            {superAdmin && selectedRole === "COMPANY_ADMIN" && (
              <div className="col-md-6 mt-3">
                <Form.Item
                  label="Company"
                  name="companyName"
                  rules={[{ required: true, message: "Company name is required for Company Admin" }]}
                >
                  <Input placeholder="Type company name" />
                </Form.Item>
              </div>
            )}
            {superAdmin && selectedRole === "STAFF" && (
              <div className="col-md-6 mt-3">
                <Form.Item label="Company" name="companyName">
                  <Input placeholder="Type company name" />
                </Form.Item>
              </div>
            )}
            {selectedRole === "STAFF" && (
              <div className="col-md-6 mt-3">
                <Form.Item label="Staff Title" name="staffTitle">
                  <Select
                    allowClear
                    placeholder="Select staff title"
                    onChange={(value) => {
                      if (value !== "CONDUCTOR") {
                        createUserForm.setFieldsValue({ assignedBus: undefined });
                      }
                      if (value !== "OFFICE_BOOKING") {
                        createUserForm.setFieldsValue({ assignedBuses: [] });
                      }
                    }}
                  >
                    <Select.Option value="CONDUCTOR">Conductor</Select.Option>
                    <Select.Option value="OFFICE_BOOKING">Office Booking</Select.Option>
                    <Select.Option value="OTHER">Other Staff</Select.Option>
                  </Select>
                </Form.Item>
              </div>
            )}
            {selectedRole === "STAFF" && selectedStaffTitle === "CONDUCTOR" && (
              <div className="col-md-6 mt-3">
                <Form.Item
                  label="Assigned Bus"
                  name="assignedBus"
                  rules={[{ required: true, message: "Assign a bus to the conductor" }]}
                >
                  <Select
                    showSearch
                    placeholder="Select bus"
                    optionFilterProp="children"
                    loading={busesFetching}
                  >
                    {buses.map((bus) => (
                      <Select.Option value={bus._id} key={bus._id}>
                        {bus.name} - {bus.number}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </div>
            )}
            {selectedRole === "STAFF" && selectedStaffTitle === "OFFICE_BOOKING" && (
              <div className="col-md-6 mt-3">
                <Form.Item
                  label="Assigned Buses"
                  name="assignedBuses"
                  rules={[{ required: true, message: "Assign at least one bus" }]}
                >
                  <Select
                    mode="multiple"
                    showSearch
                    placeholder="Select buses"
                    optionFilterProp="children"
                    loading={busesFetching}
                  >
                    {buses.map((bus) => (
                      <Select.Option value={bus._id} key={bus._id}>
                        {bus.name} - {bus.number}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </div>
            )}
            <div className="col-md-12 mt-3">
              <Form.Item label="Permissions" name="permissions">
                <Select mode="multiple" placeholder="Select allowed modules">
                  {assignablePermissions.map((permission) => (
                    <Select.Option value={permission} key={permission}>
                      {permission.replace("_", " ")}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </div>
          </div>

          <div className="d-flex justify-content-end mt-3">
            <button className="primary-btn" type="submit">
              {editingUser ? "Update User" : "Create User"}
            </button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

export default AdminUsers;
