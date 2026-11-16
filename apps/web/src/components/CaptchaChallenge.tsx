'use client';

interface CaptchaChallengeProps {
  id: string;
  checked: boolean;
  onChange: (verified: boolean, token: string) => void;
}

export function CaptchaChallenge({ id, checked, onChange }: CaptchaChallengeProps) {
  return (
    <div className="check-card">
      <label htmlFor={id} className="check-label">
        <input
          id={id}
          type="checkbox"
          className="check-input"
          checked={checked}
          onChange={(event) => {
            const isChecked = event.target.checked;
            onChange(isChecked, isChecked ? 'mock-captcha-verified' : '');
          }}
        />
        <span>
          <strong>Verificación anti-bots (CAPTCHA)</strong>
          <small className="field-hint">
            Confirma esta casilla para validar la protección automatizada antes de enviar al
            servidor.
          </small>
        </span>
      </label>
    </div>
  );
}
