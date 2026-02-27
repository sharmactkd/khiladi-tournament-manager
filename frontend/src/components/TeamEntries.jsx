// frontend/src/components/TeamEntries.jsx
import React, { useState } from "react";
import ReactSelect from "react-select";
import styles from "./TeamEntries.module.css";

const TeamEntries = ({ tournament }) => {
  // Example state for search and filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filters, setFilters] = useState({
    team: null,
    event: null,
    ageCategory: null,
    medal: null,
    coach: null
  });
  // Sample state for team entries; you might fetch this from an API or store it locally.
  const [entries, setEntries] = useState([
    // { teamName, playerName, gender, dob, weight, event }
  ]);
  // State for current team name so that repeated entries don't require retyping the team name.
  const [currentTeamName, setCurrentTeamName] = useState("");

  // Options for dropdowns (you should populate these dynamically or from your tournament data)
  const teamOptions = []; // e.g. list of teams if available
  const eventOptions = [
    { value: "Kyorugi", label: "Kyorugi" },
    { value: "Fresher", label: "Fresher" },
    { value: "Tag Team", label: "Tag Team" },
    { value: "Poomsae Individual", label: "Poomsae Individual" },
    { value: "Poomsae Pair", label: "Poomsae Pair" },
    { value: "Poomsae Team", label: "Poomsae Team" },
  ];
  const ageCategoryOptions = [
    { value: "Sub-Junior", label: "Sub-Junior" },
    { value: "Cadet", label: "Cadet" },
    { value: "Junior", label: "Junior" },
    { value: "Senior", label: "Senior" },
  ];
  const medalOptions = [
    { value: "Gold", label: "Gold" },
    { value: "Silver", label: "Silver" },
    { value: "Bronze", label: "Bronze" },
  ];
  const coachOptions = []; // e.g. list of coaches if available

  // Dummy handler for adding an entry row
  const handleAddEntry = () => {
    // For simplicity, we add a blank entry. In a real app, you would validate input.
    setEntries([...entries, { teamName: currentTeamName, playerName: "", gender: "", dob: "", weight: "", event: "" }]);
  };

  // Dummy live search filter for team entries based on player name
  const filteredEntries = entries.filter((entry) =>
    entry.playerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={styles.teamEntriesContainer}>
      {/* Sub-header menu */}
      <div className={styles.subHeader}>
        <span>Add Entries</span>
        <span>Coaches</span>
        <span>Tie-Sheets</span>
        <span>Winners Team Championship</span>
        <span>Officials</span>
      </div>

      {/* Search and filter section */}
      <div className={styles.searchFilter}>
        <input
          type="text"
          placeholder="Search by Player Name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
        <div className={styles.filters}>
          <ReactSelect
            options={teamOptions}
            placeholder="Team"
            onChange={(option) => setFilters({ ...filters, team: option })}
            className={styles.select}
          />
          <ReactSelect
            options={eventOptions}
            placeholder="Event"
            onChange={(option) => setFilters({ ...filters, event: option })}
            className={styles.select}
          />
          <ReactSelect
            options={ageCategoryOptions}
            placeholder="Age Category"
            onChange={(option) => setFilters({ ...filters, ageCategory: option })}
            className={styles.select}
          />
          <ReactSelect
            options={medalOptions}
            placeholder="Medals"
            onChange={(option) => setFilters({ ...filters, medal: option })}
            className={styles.select}
          />
          <ReactSelect
            options={coachOptions}
            placeholder="Coaches"
            onChange={(option) => setFilters({ ...filters, coach: option })}
            className={styles.select}
          />
        </div>
      </div>

      {/* Header for the team entry form */}
      <div className={styles.formHeader}>
        <label>Team Name:</label>
        <input
          type="text"
          value={currentTeamName}
          onChange={(e) => setCurrentTeamName(e.target.value)}
          placeholder="Enter team name"
          className={styles.teamNameInput}
        />
        <button onClick={handleAddEntry} className={styles.addButton}>Add Row</button>
      </div>

      {/* Excel-like table for team entries */}
      <div className={styles.entriesTable}>
        <div className={styles.tableHeader}>
          <span>Team Name</span>
          <span>Player Name</span>
          <span>Gender</span>
          <span>Date of Birth</span>
          <span>Weight</span>
          <span>Event</span>
        </div>
        {filteredEntries.map((entry, index) => (
          <div key={index} className={styles.tableRow}>
            <span>{entry.teamName}</span>
            <span>
              <input
                type="text"
                placeholder="Enter player name"
                value={entry.playerName}
                onChange={(e) => {
                  const newEntries = [...entries];
                  // Here you could add logic to add "Mr." or "Miss." based on gender
                  newEntries[index].playerName = e.target.value;
                  setEntries(newEntries);
                }}
              />
            </span>
            <span>
              <select
                value={entry.gender}
                onChange={(e) => {
                  const newEntries = [...entries];
                  newEntries[index].gender = e.target.value;
                  setEntries(newEntries);
                }}
              >
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </span>
            <span>
              <input
                type="date"
                value={entry.dob}
                onChange={(e) => {
                  const newEntries = [...entries];
                  newEntries[index].dob = e.target.value;
                  // Auto-calculate Age Category based on dob and tournament's chosen categories
                  setEntries(newEntries);
                }}
              />
            </span>
            <span>
              <input
                type="number"
                placeholder="Weight"
                value={entry.weight}
                onChange={(e) => {
                  const newEntries = [...entries];
                  newEntries[index].weight = e.target.value;
                  // Auto-calculate weight category based on gender & age if needed
                  setEntries(newEntries);
                }}
              />
            </span>
            <span>
              <select
                value={entry.event}
                onChange={(e) => {
                  const newEntries = [...entries];
                  newEntries[index].event = e.target.value;
                  setEntries(newEntries);
                }}
              >
                <option value="">Select Event</option>
                {eventOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TeamEntries;
