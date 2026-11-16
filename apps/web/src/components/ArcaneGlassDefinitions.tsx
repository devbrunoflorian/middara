/**
 * Static SVG displacement filter referenced by the shared glass surface.
 * It modifies only the captured backdrop layer; panel content stays crisp.
 */
export function ArcaneGlassDefinitions() {
  return (
    <svg
      className="arcane-glass-definitions"
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
    >
      <defs>
        <filter
          id="middara-arcane-glass-refraction"
          x="-4%"
          y="-4%"
          width="108%"
          height="108%"
          colorInterpolationFilters="sRGB"
        >
          <feMorphology in="SourceAlpha" operator="erode" radius="7" result="lensInterior" />
          <feComposite in="SourceAlpha" in2="lensInterior" operator="out" result="lensEdge" />
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.018 0.052"
            numOctaves="2"
            seed="23"
            result="staticGlassNoise"
          />
          {/* Neutral 50% channels outside the edge band keep the panel center stable. */}
          <feComposite
            in="staticGlassNoise"
            in2="lensEdge"
            operator="arithmetic"
            k1="1"
            k2="0"
            k3="-0.5"
            k4="0.5"
            result="edgeWeightedNoise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="edgeWeightedNoise"
            scale="4"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
