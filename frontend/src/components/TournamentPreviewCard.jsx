import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./TournamentPreviewCard.module.css";

const getFullImageUrl = (url) => {
  if (!url) return "/default-poster.jpg";

  let cleanUrl = String(url).trim();

  // Fix broken protocol: https:/ → https://  and http:/ → http://
  cleanUrl = cleanUrl.replace(/^https?:\/(?!\/)/g, (match) => match + "/");
  cleanUrl = cleanUrl.replace(/^http?:\/(?!\/)/g, (match) => match + "/");

  if (cleanUrl.startsWith("http://") || cleanUrl.startsWith("https://")) return cleanUrl;

  const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  const uploadsBase = String(baseUrl).replace(/\/api\/?$/, "");
  return `${uploadsBase}/uploads/${cleanUrl.replace(/^\/+/, "")}`;
};

const TournamentPreviewCard = ({ tournament, onClick }) => {
  const navigate = useNavigate();
  const [imageFailed, setImageFailed] = useState(false);

  const {
    _id,
    tournamentName,
    organizer,
    federation,
    dateFrom,
    dateTo,
    venue,
    poster,
    logos,
    tournamentLevel,
    tournamentType,
    ageCategories,
  } = tournament;

  const imageUrl = poster || (logos && logos.length > 0 ? logos[0] : "");
  const fullImageUrl = getFullImageUrl(imageUrl);

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const allAgeCategories = [
    ...(ageCategories?.open || []),
    ...(ageCategories?.official || []),
  ];
  const uniqueAgeCategories = [...new Set(allAgeCategories)].sort();
  const ageCategoriesDisplay =
    uniqueAgeCategories.length > 0 ? uniqueAgeCategories.join(", ") : "N/A";

  const handleCardClick = () => {
    if (onClick) onClick();
    navigate(`/tournaments/${_id}`);
  };

  return (
    <div className={styles.card} onClick={handleCardClick}>
      {imageUrl && !imageFailed ? (
        <img
          src={fullImageUrl}
          alt={tournamentName}
          className={styles.image}
          onLoad={() =>
            console.log("TournamentPreviewCard -> Image loaded successfully:", fullImageUrl)
          }
          onError={() => {
            console.error("TournamentPreviewCard -> Image load failed:", fullImageUrl);
            setImageFailed(true);
          }}
        />
      ) : (
        <div className={styles.imagePlaceholder}>
          <p className={styles.error}>Poster not available</p>
        </div>
      )}

      <div className={styles.content}>
        <h3 className={styles.title}>{tournamentName || "Unnamed Tournament"}</h3>
        {federation && <p className={styles.organizer}>Federation: {federation}</p>}
        {organizer && <p className={styles.organizer}>Organized by: {organizer}</p>}
        {dateFrom && dateTo && (
          <p className={styles.dates}>
            {formatDate(dateFrom)} - {formatDate(dateTo)}
          </p>
        )}
        {(tournamentLevel || tournamentType || ageCategoriesDisplay !== "N/A") && (
          <p className={styles.info}>
            Type: {tournamentType || "N/A"} | Level: {tournamentLevel || "N/A"} | Age
            Categories: {ageCategoriesDisplay}
          </p>
        )}
        {venue && venue.name && <p className={styles.venue}>Venue: {venue.name}</p>}
      </div>
    </div>
  );
};

export default TournamentPreviewCard;