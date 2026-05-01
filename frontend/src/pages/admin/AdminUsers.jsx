import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminUsers } from "../../api";
import styles from "./Admin.module.css";

const formatDate = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-IN");
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const AdminUsers = () => {
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadUsers = async (page = 1, searchValue = activeSearch) => {
    try {
      setLoading(true);
      setError("");
      const res = await getAdminUsers({ page, limit: 20, search: searchValue });
      setUsers(res.data || []);
      setPagination(res.pagination || { page, totalPages: 1 });
    } catch (err) {
      setError(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers(1, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = (event) => {
    event.preventDefault();
    setActiveSearch(search);
    loadUsers(1, search);
  };

  return (
    <div className={styles.pageStack}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>Users</h2>
            <p>All registered KHILADI users with tournament and payment summary.</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className={styles.toolbar}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, role..."
            className={styles.searchInput}
          />
          <button type="submit" className={styles.primaryBtn}>Search</button>
        </form>

        {loading ? (
          <div className={styles.stateBox}>Loading users...</div>
        ) : error ? (
          <div className={styles.errorBox}>{error}</div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.adminTable}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email / Phone</th>
                    <th>Role</th>
                    <th>Tournaments</th>
                    <th>Entries</th>
                    <th>Paid</th>
                    <th>Joined</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user._id}>
                      <td>{user.name || "-"}</td>
                      <td>{user.email || user.phone || "-"}</td>
                      <td><span className={styles.badge}>{user.role}</span></td>
                      <td>{user.totalTournaments || 0}</td>
                      <td>{user.totalEntries || 0}</td>
                      <td>{formatCurrency(user.totalAmountPaid)}</td>
                      <td>{formatDate(user.createdAt)}</td>
                      <td>
                        <Link to={`/admin/users/${user._id}`} className={styles.tableLink}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan="8" className={styles.emptyCell}>No users found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.pagination}>
              <button
                type="button"
                disabled={pagination.page <= 1}
                onClick={() => loadUsers(pagination.page - 1)}
                className={styles.secondaryBtn}
              >
                Previous
              </button>
              <span>Page {pagination.page} of {pagination.totalPages}</span>
              <button
                type="button"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => loadUsers(pagination.page + 1)}
                className={styles.secondaryBtn}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default AdminUsers;