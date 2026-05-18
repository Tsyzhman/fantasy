"use client";

import { type FormHTMLAttributes, useRef } from "react";

type AutoSubmitFormProps = FormHTMLAttributes<HTMLFormElement>;

export function AutoSubmitForm({ children, onChange, ...props }: AutoSubmitFormProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <form
      {...props}
      onChange={(event) => {
        onChange?.(event);
        const form = event.currentTarget;

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          form.requestSubmit();
        }, 250);
      }}
    >
      {children}
    </form>
  );
}
