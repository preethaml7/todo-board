"use client";

import * as React from "react";
import { useActionState, useMemo, useState } from "react";
import { Eye, EyeOff, Lock, User, ShieldCheck } from "lucide-react";
import { registerAction, type AuthState } from "@/app/actions/auth";
import PasswordField from "./PasswordField";
import styles from "./OnboardingForm.module.css";

const initial: AuthState = {};

type Strength = { pct: number; label: string; color: string; tone: "weak" | "fair" | "good" | "strong" };

function scorePassword(pw: string): Strength {
  if (!pw) return { pct: 0, label: "", color: "var(--border)", tone: "weak" };
  let score = 0;
  if (pw.length >= 10) score++;
  if (pw.length >= 14) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const levels: Strength[] = [
    { pct: 0,  label: "Too short", color: "#d1453b", tone: "weak" },
    { pct: 20, label: "Weak",      color: "#d1453b", tone: "weak" },
    { pct: 40, label: "Fair",      color: "#d68a1e", tone: "fair" },
    { pct: 60, label: "Good",      color: "#c9a21e", tone: "good" },
    { pct: 80, label: "Strong",    color: "#2f9e6f", tone: "strong" },
    { pct: 100, label: "Excellent", color: "#2f9e6f", tone: "strong" },
  ];
  const idx = Math.min(score, levels.length - 1);
  return levels[idx];
}

export default function OnboardingForm() {
  const [state, formAction, pending] = useActionState(registerAction, initial);
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const strength = useMemo(() => scorePassword(pw), [pw]);
  const fe = state.fieldErrors ?? {};
  const allValid = pw.length >= 10;

  return (
    <div className={styles.card}>
      <header className={styles.header}>
        <div className={styles.eyebrow}>
          <ShieldCheck size={13} aria-hidden />
          Create your account
        </div>
        <h2 className={styles.title}>Set up your board</h2>
        <p className={styles.sub}>
          One account, one user, this device. After this, registration closes permanently.
        </p>
      </header>

      {state.error && (
        <div className={styles.formError} role="alert">
          <span className={styles.formErrorIcon} aria-hidden>!</span>
          {state.error}
        </div>
      )}

      <form action={formAction} className={styles.form} noValidate>
        <div className="field">
          <label htmlFor="username">Username</label>
          <div className={styles.inputWrap}>
            <User size={15} className={styles.inputIcon} aria-hidden />
            <input
              id="username"
              className={`input ${styles.input}`}
              name="username"
              autoComplete="username"
              autoFocus
              required
              aria-required="true"
              aria-invalid={Boolean(fe.username)}
              aria-describedby={fe.username ? "username-err" : undefined}
              placeholder="e.g. alex"
              minLength={1}
            />
          </div>
          {fe.username && (
            <div id="username-err" className="field-error" role="alert">
              {fe.username}
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="password">
            Password
            <span className={styles.requiredMark} aria-hidden>
              {" "}*
            </span>
          </label>
          <div className={styles.inputWrap}>
            <Lock size={15} className={styles.inputIcon} aria-hidden />
            <input
              id="password"
              className={`input ${styles.input}`}
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete="new-password"
              required
              aria-required="true"
              aria-invalid={Boolean(fe.password)}
              aria-describedby={fe.password ? "password-err" : "password-help"}
              placeholder="At least 10 characters"
              value={pw}
              minLength={10}
              onChange={(e) => setPw(e.target.value)}
            />
            <button
              type="button"
              className={styles.reveal}
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? "Hide password" : "Show password"}
              aria-pressed={showPw}
              tabIndex={0}
            >
              {showPw ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
            </button>
          </div>
          {pw && (
            <div
              className={styles.strength}
              role="status"
              aria-live="polite"
            >
              <div className={styles.strengthBar}>
                <span
                  className={styles[`tone-${strength.tone}`]}
                  style={{ width: `${strength.pct}%` }}
                />
              </div>
              <small className={styles.strengthLabel} style={{ color: strength.color }}>
                {strength.label}
              </small>
            </div>
          )}
          <div id="password-help" className={styles.helpText}>
            Use 10+ characters. Mix upper/lowercase, numbers, and a symbol.
          </div>
          {fe.password && (
            <div id="password-err" className="field-error" role="alert">
              {fe.password}
            </div>
          )}
        </div>

        <div className="field">
          <label htmlFor="confirm">
            Confirm password
            <span className={styles.requiredMark} aria-hidden>
              {" "}*
            </span>
          </label>
          <div className={styles.inputWrap}>
            <Lock size={15} className={styles.inputIcon} aria-hidden />
            <input
              id="confirm"
              className={`input ${styles.input}`}
              name="confirm"
              type={showConfirm ? "text" : "password"}
              autoComplete="new-password"
              required
              aria-required="true"
              aria-invalid={Boolean(fe.confirm)}
              aria-describedby={fe.confirm ? "confirm-err" : undefined}
              placeholder="Re-enter your password"
            />
            <button
              type="button"
              className={styles.reveal}
              onClick={() => setShowConfirm((s) => !s)}
              aria-label={showConfirm ? "Hide confirmation" : "Show confirmation"}
              aria-pressed={showConfirm}
              tabIndex={0}
            >
              {showConfirm ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
            </button>
          </div>
          {fe.confirm && (
            <div id="confirm-err" className="field-error" role="alert">
              {fe.confirm}
            </div>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{
            width: "100%",
            justifyContent: "center",
            marginTop: 8,
            height: 44,
            fontSize: 14.5,
            fontWeight: 600,
          }}
          disabled={pending || !allValid}
        >
          {pending ? "Creating account…" : "Create account & continue"}
        </button>
      </form>

      <footer className={styles.foot}>
        <Lock size={11} aria-hidden style={{ verticalAlign: "middle" }} />
        <span>Argon2id-hashed · never transmitted</span>
      </footer>
    </div>
  );
}
