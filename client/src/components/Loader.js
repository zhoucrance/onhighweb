import React from "react";

function Loader() {
  return (
    <div className="spinner-parent">
      <div className="ohb-loader" role="status" aria-live="polite">
        <svg
          className="ohb-bus-svg"
          viewBox="0 0 140 80"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          focusable="false"
        >
          {/* road */}
          <line
            className="ohb-road"
            x1="0"
            y1="68"
            x2="140"
            y2="68"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.9"
          />

          {/* motion streaks trailing the bus */}
          <g stroke="#ffffff" strokeWidth="3" strokeLinecap="round">
            <line
              className="ohb-speed-line ohb-speed-1"
              x1="2"
              y1="24"
              x2="18"
              y2="24"
            />
            <line
              className="ohb-speed-line ohb-speed-2"
              x1="0"
              y1="34"
              x2="12"
              y2="34"
            />
            <line
              className="ohb-speed-line ohb-speed-3"
              x1="4"
              y1="44"
              x2="16"
              y2="44"
            />
          </g>

          {/* bus body */}
          <g className="ohb-bus-body">
            <rect x="26" y="14" width="92" height="38" rx="7" fill="#ffffff" />
            <rect x="33" y="21" width="15" height="13" rx="2.5" fill="#9fe0c9" />
            <rect x="52" y="21" width="15" height="13" rx="2.5" fill="#9fe0c9" />
            <rect x="71" y="21" width="15" height="13" rx="2.5" fill="#9fe0c9" />
            {/* windscreen */}
            <path d="M95 21h13a4 4 0 0 1 4 4v9H95z" fill="#cfeffe" />
            {/* brand stripe */}
            <rect x="26" y="41" width="92" height="5" fill="#058359" />
            {/* headlight */}
            <circle cx="114" cy="49" r="2.6" fill="#ffd54f" />
          </g>

          {/* wheels */}
          <g className="ohb-wheel">
            <circle cx="45" cy="54" r="8.5" fill="#263238" />
            <circle cx="45" cy="54" r="3.6" fill="#cfd8dc" />
            <line
              x1="45"
              y1="47"
              x2="45"
              y2="61"
              stroke="#cfd8dc"
              strokeWidth="1.4"
            />
            <line
              x1="38"
              y1="54"
              x2="52"
              y2="54"
              stroke="#cfd8dc"
              strokeWidth="1.4"
            />
          </g>
          <g className="ohb-wheel">
            <circle cx="99" cy="54" r="8.5" fill="#263238" />
            <circle cx="99" cy="54" r="3.6" fill="#cfd8dc" />
            <line
              x1="99"
              y1="47"
              x2="99"
              y2="61"
              stroke="#cfd8dc"
              strokeWidth="1.4"
            />
            <line
              x1="92"
              y1="54"
              x2="106"
              y2="54"
              stroke="#cfd8dc"
              strokeWidth="1.4"
            />
          </g>
        </svg>

        <span className="ohb-loader-text">Loading&hellip;</span>
      </div>
    </div>
  );
}

export default Loader;
