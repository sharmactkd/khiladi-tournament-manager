import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./TournamentPreviewCard.module.css";

// Function to construct the full image URL
const getFullImageUrl = (url) => {
  if (!url) return "/default-poster.jpg";
  if (url.startsWith("http")) return url; // Cloudinary URL direct return
  return url; // Already full URL from backend
};

const TournamentPreviewCard = ({ tournament, onClick }) => {
  const navigate = useNavigate();
  const [imageFailed, setImageFailed] = useState(false);

  // Destructure tournament data
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

  
  // Determine the image source (poster or first logo, if available)
  const imageUrl = poster || (logos && logos.length > 0 ? logos[0] : "");
  const fullImageUrl = getFullImageUrl(imageUrl);

  
  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Combine and deduplicate age categories from open and official
  const allAgeCategories = [
    ...(ageCategories?.open || []),
    ...(ageCategories?.official || []),
  ];
  const uniqueAgeCategories = [...new Set(allAgeCategories)].sort();
  const ageCategoriesDisplay = uniqueAgeCategories.length > 0 ? uniqueAgeCategories.join(", ") : "N/A";

  // Handle card click to navigate to tournament details
  const handleCardClick = () => {
    if (onClick) onClick();
    navigate(`/tournaments/${_id}`);
  };

  return (
    <div className={styles.card} onClick={handleCardClick}>
      {/* Image or placeholder */}
      {imageUrl && !imageFailed ? (
        <img
          src={fullImageUrl}
          alt={tournamentName}
          className={styles.image}
          onLoad={() => console.log("TournamentPreviewCard -> Image loaded successfully:", fullImageUrl)}
          onError={(e) => {
            console.error("TournamentPreviewCard -> Image load failed:", fullImageUrl);
            setImageFailed(true);
          }}
        />
      ) : (
        <div className={styles.imagePlaceholder}>
          <p className={styles.error}>Poster not available</p>
        </div>
      )}

      {/* Tournament details */}
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
            Type: {tournamentType || "N/A"} | Level: {tournamentLevel || "N/A"} | Age Categories: {ageCategoriesDisplay}
          </p>
        )}
        {venue && venue.name && (
          <p className={styles.venue}>Venue: {venue.name}</p>
        )}
        
      </div>
    </div>
  );
};

export default TournamentPreviewCard;