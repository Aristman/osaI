/**
 * @osai/cli -- Input Area (DOMAIN-011, T-003)
 *
 * Область ввода сообщений пользователя.
 * Поддерживает многострочный ввод через Shift+Enter (в будущем),
 * в текущей версии -- однострочный ввод с Enter для отправки.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InputAreaProps {
  /** Callback при отправке сообщения */
  onSubmit: (text: string) => void;
  /** Placeholder текст */
  placeholder?: string;
  /** Отключен ли ввод */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// InputArea
// ---------------------------------------------------------------------------

/**
 * Область ввода пользователя.
 *
 * TT-003-02: Пользователь вводит текст и нажимает Enter
 */
export function InputArea({
  onSubmit,
  placeholder = "Type a message...",
  disabled = false,
}: InputAreaProps): React.ReactElement {
  const [value, setValue] = useState("");

  useInput((input, key) => {
    if (disabled) {
      return;
    }

    if (key.return) {
      // Enter -- отправить сообщение
      const trimmed = value.trim();
      if (trimmed !== "") {
        onSubmit(trimmed);
        setValue("");
      }
      return;
    }

    if (key.backspace || key.delete) {
      // Удалить последний символ
      setValue((prev) => prev.slice(0, -1));
      return;
    }

    if (key.escape) {
      // Escape -- очистить ввод
      setValue("");
      return;
    }

    // Обычный ввод символа
    if (input) {
      setValue((prev) => prev + input);
    }
  });

  return (
    <Box borderStyle="round" borderColor="gray" paddingX={1}>
      <Text color={disabled ? "gray" : "white"}>
        {disabled ? "(disconnected) " : "> "}
        {value || <Text color="gray">{placeholder}</Text>}
        <Text color="white"> </Text>
      </Text>
    </Box>
  );
}
