"use client";

import { useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import styles from "./Input.module.css";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export function Input({ label, error, helper, id, className, ...rest }: InputProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div className={[styles.field, error ? styles.hasError : "", className].filter(Boolean).join(" ")}>
      {label && (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
        </label>
      )}
      <input id={fieldId} className={styles.input} {...rest} />
      {error ? <span className={styles.error}>{error}</span> : helper ? <span className={styles.helper}>{helper}</span> : null}
    </div>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, id, className, ...rest }: TextareaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div className={[styles.field, error ? styles.hasError : "", className].filter(Boolean).join(" ")}>
      {label && (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
        </label>
      )}
      <textarea id={fieldId} className={styles.input} rows={3} {...rest} />
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  );
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export function Select({ label, error, id, className, children, ...rest }: SelectProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div className={[styles.field, error ? styles.hasError : "", className].filter(Boolean).join(" ")}>
      {label && (
        <label className={styles.label} htmlFor={fieldId}>
          {label}
        </label>
      )}
      <select id={fieldId} className={styles.input} {...rest}>
        {children}
      </select>
      {error ? <span className={styles.error}>{error}</span> : null}
    </div>
  );
}
