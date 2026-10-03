/** Decorative skyline, street lamps and moon on the home stage. */
export function Townscape() {
  return (
    <div className="townscape" aria-hidden="true">
      <div className="skyline">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => (
          <span key={n} className={`building b${n}`} />
        ))}
      </div>
      <span className="streetlamp lamp1" />
      <span className="streetlamp lamp2" />
      <span className="moon" />
    </div>
  );
}
