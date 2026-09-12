import type { ReactNode } from "react";
import "./Modal.css";

export interface ModalButton {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  onClick: () => void;
}

export interface ModalProps {
  open: boolean;
  title: string;
  body?: ReactNode;
  buttons: ModalButton[];
  onDismiss?: () => void;
}

/** What a screen needs to supply to open the shared modal (App.tsx adds `open`). */
export type ModalConfig = Pick<ModalProps, "title" | "body" | "buttons">;

// One generic modal reused for every confirm/prompt dialog in the app
// (unsaved changes, save-this-setup, name-your-profile).
export default function Modal({ open, title, body, buttons, onDismiss }: ModalProps) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onDismiss}>
      <div className="modal-card card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">{title}</h2>
        {body && <div className="modal-body">{body}</div>}
        <div className="modal-actions">
          {buttons.map((button) => (
            <button
              key={button.label}
              className={`btn btn-${button.variant ?? "secondary"}`}
              onClick={button.onClick}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
