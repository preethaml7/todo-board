"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { loginAction, type AuthState } from "@/app/actions/auth";
import PasswordField from "./PasswordField";

const initial: AuthState = {};

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <div className="auth-card anim-pop">
      <div className="auth-badge">
        <LogIn size={22} />
      </div>
      <h1 className="auth-title">Welcome back</h1>
      <p className="auth-sub">Sign in to your to-do board.</p>

      {state.error && <div className="form-error">{state.error}</div>}

      <form action={formAction}>
        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            className="input"
            name="username"
            autoComplete="username"
            autoFocus
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <PasswordField
            name="password"
            autoComplete="current-password"
            placeholder="Your password"
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
          disabled={pending}
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
