export function CardinalityMarkers() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        <marker
          id="arrow-end"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill="#555" />
        </marker>
        <marker
          id="arrow-start"
          markerWidth="10"
          markerHeight="10"
          refX="0"
          refY="3"
          orient="auto-start-reverse"
          markerUnits="strokeWidth"
        >
          <path d="M0,0 L0,6 L9,3 z" fill="#555" />
        </marker>
      </defs>
    </svg>
  );
}
