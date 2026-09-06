/**
 * Selector de casas (oculto si solo hay una casa configurada).
 * Las casas con PIN todavía no desbloqueado se muestran con candado.
 */
export default function HouseBar({ houses, active, unlocked, onSelect }) {
  if (!houses || houses.length < 2) return null;
  return (
    <div className="house-bar">
      <span className="house-label">Mi panel:</span>
      {houses.map((h) => {
        const locked = h.requiresPin && !unlocked.includes(h.id);
        return (
          <button
            key={h.id}
            type="button"
            className={`house-pill${h.id === active ? ' active' : ''}`}
            onClick={() => onSelect(h)}
            title={locked ? `${h.name} — introduce el PIN para desbloquear` : `${h.name} — ver datos`}
          >
            <span className="house-icon">{locked ? '🔒' : '🏠'}</span>
            {h.name}
          </button>
        );
      })}
    </div>
  );
}
