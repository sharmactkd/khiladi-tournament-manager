import React, { useEffect, useState } from "react";
import { validateContactNumber } from "../Entry/helpers";
import TeamEntryTable from "./TeamEntryTable";
import modalStyles from "./AddTeamEntriesModal.module.css";

const createEmptyTeamInfo = () => ({
  team: "",
  coach: "",
  coachContact: "",
  manager: "",
  managerContact: "",
});

const AddTeamEntriesModal = ({
  show,
  onClose,
  onSubmit,
  tournamentData,
  visibleColumns = { fathersName: false, school: false, class: false },
  title = "Add Team Entries",
  submitButtonText = "Submit Entries",
  initialTeamInfo = null,
  readOnlyFields = {},
}) => {
  const [teamInfo, setTeamInfo] = useState(createEmptyTeamInfo());
  const [rows, setRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (!show) {
      setTeamInfo(createEmptyTeamInfo());
      setRows([]);
      setSubmitting(false);
      setSubmitError("");
      setFieldErrors({});
      return;
    }

    setTeamInfo({
      ...createEmptyTeamInfo(),
      ...(initialTeamInfo || {}),
    });
  }, [show, initialTeamInfo]);

  if (!show) return null;

  const setTeamFieldValue = (field, value) => {
    if (readOnlyFields?.[field]) return;

    setTeamInfo((prev) => ({
      ...prev,
      [field]: value,
    }));

    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const normalizeTeamName = (value) => String(value || "").trim().toUpperCase();

  const validateTeamInfo = () => {
    const nextErrors = {};

    if (!String(teamInfo.team || "").trim()) {
      nextErrors.team = "Team Name is required.";
    }

    const coachValidation = validateContactNumber(
      String(teamInfo.coachContact || "").replace(/[^0-9]/g, "")
    );
    if (teamInfo.coachContact && !coachValidation.isValid) {
      nextErrors.coachContact = coachValidation.message;
    }

    const managerValidation = validateContactNumber(
      String(teamInfo.managerContact || "").replace(/[^0-9]/g, "")
    );
    if (teamInfo.managerContact && !managerValidation.isValid) {
      nextErrors.managerContact = managerValidation.message;
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildFinalRows = () => {
    const coachValidation = validateContactNumber(
      String(teamInfo.coachContact || "").replace(/[^0-9]/g, "")
    );
    const managerValidation = validateContactNumber(
      String(teamInfo.managerContact || "").replace(/[^0-9]/g, "")
    );

    return rows.map((row) => ({
      ...row,
      actions: "",
      sr: "",
      team: normalizeTeamName(teamInfo.team),
      coach: String(teamInfo.coach || "").trim(),
      coachContact: coachValidation.isValid ? coachValidation.formatted : "",
      manager: String(teamInfo.manager || "").trim(),
      managerContact: managerValidation.isValid ? managerValidation.formatted : "",
    }));
  };

  const handleSubmit = async () => {
    setSubmitError("");

    const teamOk = validateTeamInfo();
    if (!teamOk) return;

    try {
      setSubmitting(true);
      const finalRows = buildFinalRows();
      await onSubmit(finalRows, {
        ...teamInfo,
        team: normalizeTeamName(teamInfo.team),
      });
    } catch (error) {
      setSubmitError(error?.message || "Failed to submit team entries.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !submitting) {
      onClose();
    }
  };

  return (
    <div
      className={modalStyles.overlay}
      onMouseDown={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className={modalStyles.modal}>
        <div className={modalStyles.header}>
          <h2 className={modalStyles.title}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className={modalStyles.closeButton}
            disabled={submitting}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className={modalStyles.body}>
          <div className={modalStyles.teamSection}>
            <h3 className={modalStyles.sectionTitle}>Common Team Details</h3>

            <div className={modalStyles.teamGrid}>
              <div className={modalStyles.fieldGroup}>
                <label className={modalStyles.label}>Team Name</label>
                <input
                  type="text"
                  value={teamInfo.team}
                  disabled={!!readOnlyFields.team}
                  onChange={(e) => setTeamFieldValue("team", normalizeTeamName(e.target.value))}
                  className={modalStyles.input}
                  placeholder="Enter team name"
                />
                {fieldErrors.team && (
                  <div className={modalStyles.errorText}>{fieldErrors.team}</div>
                )}
              </div>

              <div className={modalStyles.fieldGroup}>
                <label className={modalStyles.label}>Coach Name</label>
                <input
                  type="text"
                  value={teamInfo.coach}
                  disabled={!!readOnlyFields.coach}
                  onChange={(e) => setTeamFieldValue("coach", e.target.value)}
                  className={modalStyles.input}
                  placeholder="Enter coach name"
                />
              </div>

              <div className={modalStyles.fieldGroup}>
                <label className={modalStyles.label}>Coach Contact Number</label>
                <input
                  type="text"
                  value={teamInfo.coachContact}
                  disabled={!!readOnlyFields.coachContact}
                  onChange={(e) => setTeamFieldValue("coachContact", e.target.value)}
                  className={modalStyles.input}
                  placeholder="Enter coach contact"
                />
                {fieldErrors.coachContact && (
                  <div className={modalStyles.errorText}>{fieldErrors.coachContact}</div>
                )}
              </div>

              <div className={modalStyles.fieldGroup}>
                <label className={modalStyles.label}>Manager Name</label>
                <input
                  type="text"
                  value={teamInfo.manager}
                  disabled={!!readOnlyFields.manager}
                  onChange={(e) => setTeamFieldValue("manager", e.target.value)}
                  className={modalStyles.input}
                  placeholder="Enter manager name"
                />
              </div>

              <div className={modalStyles.fieldGroup}>
                <label className={modalStyles.label}>Manager Contact Number</label>
                <input
                  type="text"
                  value={teamInfo.managerContact}
                  disabled={!!readOnlyFields.managerContact}
                  onChange={(e) => setTeamFieldValue("managerContact", e.target.value)}
                  className={modalStyles.input}
                  placeholder="Enter manager contact"
                />
                {fieldErrors.managerContact && (
                  <div className={modalStyles.errorText}>{fieldErrors.managerContact}</div>
                )}
              </div>
            </div>
          </div>

          <div className={modalStyles.playersSection}>
            <div className={modalStyles.playersHeader}>
              <h3 className={modalStyles.sectionTitle}>Players Entry Table</h3>
            </div>

            <TeamEntryTable
              tournamentData={tournamentData}
              rows={rows}
              setRows={setRows}
              disabled={submitting}
              visibleColumns={visibleColumns}
            />
          </div>

          {submitError && <div className={modalStyles.submitError}>{submitError}</div>}
        </div>

        <div className={modalStyles.footer}>
          <button
            type="button"
            onClick={onClose}
            className={modalStyles.cancelButton}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className={modalStyles.submitButton}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : submitButtonText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddTeamEntriesModal;