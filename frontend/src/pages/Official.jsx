// src/pages/Official.jsx
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import axios from "axios";
import { Trash2 } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import styles from "./Official.module.css";

const getFullImageUrl = (filename) => {
  if (!filename) return "";
  if (filename.startsWith("http")) return filename;
  const cleanFilename = filename.replace(/^.*[\\/]/, "");
  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000";
  const uploadsUrl = baseUrl.replace(/\/api$/, "");
  return `${uploadsUrl}/uploads/${cleanFilename}?t=${Date.now()}`;
};

const Official = () => {
  const { id: rawId } = useParams();
  const id = rawId?.trim();
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAuth();

  const [tournament, setTournament] = useState(null);
  const [officials, setOfficials] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const pdfPageRef = useRef(null);

  if (!isAuthenticated) {
    navigate("/login");
    return null;
  }

  // Load data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
        const config = token ? { headers: { Authorization: `Bearer ${token}` } } : {};

        const tournamentRes = await axios.get(`${baseUrl}/tournament/${id}`, config);
        setTournament({
          name: tournamentRes.data.tournamentName || "Unnamed Tournament",
          federation: tournamentRes.data.federation || "N/A",
          logos: tournamentRes.data.logos || [],
        });

        let loadedOfficials = [];

        try {
          const officialsRes = await axios.get(`${baseUrl}/tournament/${id}/officials`, config);
          loadedOfficials = officialsRes.data.officials || [];
          console.log("Officials loaded from server");
        } catch (serverErr) {
          console.warn("No officials on server:", serverErr.message);
        }

        if (loadedOfficials.length === 0) {
          const saved = localStorage.getItem(`officialsData_${id}`);
          if (saved) {
            try {
              loadedOfficials = JSON.parse(saved);
              console.log("Officials loaded from localStorage");
            } catch {}
          }
        }

        if (loadedOfficials.length === 0) {
          loadedOfficials = [{ name: "", rank: "", dan: "", danNumber: "", mark: "" }];
        }

        setOfficials(loadedOfficials);
        setIsLoading(false);
      } catch (err) {
        setError(err.message || "Failed to load data");
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id, token]);

  // Silent real-time auto-saving (no message)
  useEffect(() => {
    if (officials.length === 0) return;

    const timeoutId = setTimeout(async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

        await axios.put(
          `${baseUrl}/tournament/${id}/officials`,
          { officials },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        localStorage.setItem(`officialsData_${id}`, JSON.stringify(officials));
      } catch (err) {
        console.error("Silent auto-save failed:", err);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [officials, id, token]);

  // Update row
  const updateRow = (index, field, value) => {
    const updated = [...officials];
    updated[index][field] = value;
    setOfficials(updated);
  };

  // Delete row
  const deleteRow = (index) => {
    setOfficials(officials.filter((_, i) => i !== index));
  };

  // Enter key → new row + focus (Mark field में Enter)
  const handleEnterKey = (e, rowIndex, field) => {
    if (e.key === "Enter") {
      e.preventDefault();

      const fields = ["name", "rank", "dan", "danNumber", "mark"];
      const currentFieldIndex = fields.indexOf(field);

      if (currentFieldIndex === fields.length - 1) {
        const newOfficials = [
          ...officials,
          { name: "", rank: "", dan: "", danNumber: "", mark: "" },
        ];
        setOfficials(newOfficials);

        setTimeout(() => {
          const rows = document.querySelectorAll(`.${styles.table} tbody tr`);
          const lastRow = rows[rows.length - 1];
          if (lastRow) {
            const firstInput = lastRow.querySelector("input");
            if (firstInput) firstInput.focus();
          }
        }, 0);
      }
    }
  };

  /* ────── PDF Generation (SAME logic as TeamChampionship.jsx) ────── */
  const generatePDFDoc = async () => {
    if (!pdfPageRef.current) {
      console.error("PDF page ref not found");
      alert("Page not ready for PDF generation");
      return null;
    }

    const page = pdfPageRef.current;

    // Landscape A4
    const doc = new jsPDF("l", "mm", "a4");

    const clone = page.cloneNode(true);
    const container = document.createElement("div");
    Object.assign(container.style, {
      position: "absolute",
      left: "-9999px",
      top: "-9999px",
      width: "297mm",
      height: "210mm",
      background: "#ffffff",
      padding: "15mm",
      boxSizing: "border-box",
    });
    container.appendChild(clone);
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(clone, {
        scale: 2.2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");

      const pdfWidth = 297;
      const pdfHeight = 210;

      const ratio = Math.min(
        (pdfWidth - 30) / canvas.width,
        (pdfHeight - 30) / canvas.height
      );

      const imgWidth = canvas.width * ratio;
      const imgHeight = canvas.height * ratio;

      const x = (pdfWidth - imgWidth) / 2;
      const y = (pdfHeight - imgHeight) / 2;

      doc.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);

      return doc;
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to generate PDF");
      return null;
    } finally {
      document.body.removeChild(container);
    }
  };

  const saveAllPDF = async () => {
    const doc = await generatePDFDoc();
    if (doc) {
      doc.save(
        `Officials_${tournament?.name?.replace(/[^a-z0-9]/gi, "_") || "Tournament"}_${id}.pdf`
      );
    }
  };

  const printAllPDF = async () => {
    const doc = await generatePDFDoc();
    if (doc) {
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const printWin = window.open(url, "_blank");
      if (printWin) printWin.focus();
    }
  };

  if (isLoading) return <div className={styles.loading}>Loading Officials...</div>;
  if (error) return <div className={styles.container}><h2>Error: {error}</h2></div>;

  const logoLeft = tournament?.logos?.[0] ? getFullImageUrl(tournament.logos[0]) : null;
  const logoRight = tournament?.logos?.[1] ? getFullImageUrl(tournament.logos[1]) : logoLeft;

  const hasOfficials = Array.isArray(officials) && officials.some((o) =>
    (o?.name || "").trim() ||
    (o?.rank || "").trim() ||
    (o?.dan || "").trim() ||
    (o?.danNumber || "").trim() ||
    (o?.mark || "").trim()
  );

  return (
    <div className={styles.container}>
      {/* Print & Save PDF Buttons — SAME position + styling as TeamChampionship */}
      <div className={styles.buttonSection}>
        <div className={styles.pdfButtonWrapper}>
          <button
            onClick={printAllPDF}
            className={styles.printButton}
            disabled={!hasOfficials}
          >
            Print
          </button>
          <button
            onClick={saveAllPDF}
            className={styles.pdfButton}
            disabled={!hasOfficials}
          >
            Save PDF
          </button>
        </div>
      </div>

      {/* Main Content - Wrapped for PDF */}
      <div ref={pdfPageRef} className={styles.officialPage}>
        {/* Header */}
        <div className={styles.header}>
          {logoLeft && (
            <img src={logoLeft} alt="Logo Left" className={styles.logoLeft} />
          )}
          <div className={styles.headerContent}>
            <h1 className={styles.tournamentName}>{tournament?.name?.toUpperCase()}</h1>
            <p className={styles.federation}>{tournament?.federation}</p>
            <h2 className={styles.title}>OFFICIALS</h2>
          </div>
          {logoRight && (
            <img src={logoRight} alt="Logo Right" className={styles.logoRight} />
          )}
        </div>

        {/* Table */}
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>S.N.</th>
                <th>Name</th>
                <th>Rank</th>
                <th>Dan</th>
                <th>Dan Number</th>
                <th>Mark</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {officials.map((official, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>
                    <input
                      type="text"
                      value={official.name}
                      onChange={(e) => updateRow(index, "name", e.target.value)}
                      onKeyDown={(e) => handleEnterKey(e, index, "name")}
                      placeholder="Name"
                      className={styles.input}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={official.rank}
                      onChange={(e) => updateRow(index, "rank", e.target.value)}
                      onKeyDown={(e) => handleEnterKey(e, index, "rank")}
                      placeholder="Rank"
                      className={styles.input}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={official.dan}
                      onChange={(e) => updateRow(index, "dan", e.target.value)}
                      onKeyDown={(e) => handleEnterKey(e, index, "dan")}
                      placeholder="Dan"
                      className={styles.input}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={official.danNumber}
                      onChange={(e) => updateRow(index, "danNumber", e.target.value)}
                      onKeyDown={(e) => handleEnterKey(e, index, "danNumber")}
                      placeholder="Dan Number"
                      className={styles.input}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={official.mark}
                      onChange={(e) => updateRow(index, "mark", e.target.value)}
                      onKeyDown={(e) => handleEnterKey(e, index, "mark")}
                      placeholder="Mark"
                      className={styles.input}
                    />
                  </td>
                  <td>
                    <button
                      onClick={() => deleteRow(index)}
                      className={styles.deleteButton}
                      aria-label="Delete row"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Official;