interface DevelopmentEnvironmentStatusProps {
  webOrigin: string;
  apiOrigin: string;
  locale: string;
  isAdmin: boolean;
  mode: string;
}

export function DevelopmentEnvironmentStatus({
  webOrigin,
  apiOrigin,
  locale,
  isAdmin,
  mode,
}: DevelopmentEnvironmentStatusProps) {
  return (
    <details
      className="dev-environment-status"
      data-web-origin={webOrigin}
      data-api-origin={apiOrigin}
      data-locale={locale}
      data-mode={mode}
      data-admin={isAdmin ? 'on' : 'off'}
    >
      <summary aria-label="Development environment details" title="Development environment">
        <span className="dev-environment-dot" aria-hidden="true" />
        <span>DEV</span>
      </summary>
      <div className="dev-environment-card arcane-glass-surface" role="group" aria-label="Development environment details">
        <p className="dev-environment-heading">Development environment</p>
        <dl>
          <div><dt>WEB</dt><dd><code>{webOrigin}</code></dd></div>
          <div><dt>API</dt><dd><code>{apiOrigin}</code></dd></div>
          <div><dt>LOCALE</dt><dd>{locale}</dd></div>
          <div><dt>ADMIN</dt><dd>{isAdmin ? 'ON' : 'OFF'}</dd></div>
          <div><dt>MODE</dt><dd>{mode}</dd></div>
        </dl>
      </div>
    </details>
  );
}
