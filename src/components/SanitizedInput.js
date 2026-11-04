import React, { useState, useEffect, useCallback } from 'react';
import { sanitizeInput, sanitizeInputLight, removeHtmlTags, debounce, SANITIZE_OPTIONS } from '../utils/sanitizeUtils';

/**
 * サニタイズ機能付きInputコンポーネント
 * XSS攻撃を防ぐための安全な入力処理を提供
 */
const SanitizedInput = ({
  type = 'text',
  value = '',
  onChange,
  onBlur,
  sanitizeMode = SANITIZE_OPTIONS.FULL,
  debounceMs = 300,
  className = '',
  placeholder = '',
  required = false,
  disabled = false,
  maxLength,
  minLength,
  pattern,
  autoComplete,
  autoFocus = false,
  readOnly = false,
  id,
  name,
  ...props
}) => {
  const [internalValue, setInternalValue] = useState(value);
  const [isSanitizing, setIsSanitizing] = useState(false);

  // サニタイズ関数の選択
  const getSanitizeFunction = useCallback(() => {
    switch (sanitizeMode) {
      case SANITIZE_OPTIONS.FULL:
        return sanitizeInput;
      case SANITIZE_OPTIONS.LIGHT:
        return sanitizeInputLight;
      case SANITIZE_OPTIONS.HTML_ONLY:
        return removeHtmlTags;
      case SANITIZE_OPTIONS.NONE:
        return (input) => input;
      default:
        return sanitizeInput;
    }
  }, [sanitizeMode]);

  // デバウンスされたサニタイズ処理
  const debouncedSanitize = useCallback(
    debounce((inputValue) => {
      const sanitizeFunc = getSanitizeFunction();
      const sanitizedValue = sanitizeFunc(inputValue);
      
      if (sanitizedValue !== inputValue) {
        setInternalValue(sanitizedValue);
        if (onChange) {
          onChange({
            target: {
              value: sanitizedValue,
              name: name,
              id: id
            }
          });
        }
      }
      setIsSanitizing(false);
    }, debounceMs),
    [getSanitizeFunction, onChange, name, id, debounceMs]
  );

  // 値の変更処理
  const handleChange = useCallback((e) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    setIsSanitizing(true);
    
    // 即座にonChangeを呼び出し（リアルタイム更新のため）
    if (onChange) {
      onChange(e);
    }
    
    // デバウンスされたサニタイズ処理を実行
    debouncedSanitize(newValue);
  }, [onChange, debouncedSanitize]);

  // フォーカスアウト時の処理
  const handleBlur = useCallback((e) => {
    const sanitizeFunc = getSanitizeFunction();
    const sanitizedValue = sanitizeFunc(e.target.value);
    
    if (sanitizedValue !== e.target.value) {
      setInternalValue(sanitizedValue);
      if (onChange) {
        onChange({
          target: {
            value: sanitizedValue,
            name: name,
            id: id
          }
        });
      }
    }
    
    if (onBlur) {
      onBlur(e);
    }
    setIsSanitizing(false);
  }, [getSanitizeFunction, onChange, onBlur, name, id]);

  // 外部からの値変更に対応
  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  // サニタイズ中のインジケーター
  const sanitizeIndicator = isSanitizing && (
    <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
      <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  // textareaの場合はtextarea要素を、それ以外はinput要素をレンダリング
  const InputElement = type === 'textarea' ? 'textarea' : 'input';

  return (
    <div className="relative">
      <InputElement
        type={type === 'textarea' ? undefined : type}
        value={internalValue}
        onChange={handleChange}
        onBlur={handleBlur}
        className={`${className} ${isSanitizing ? 'border-blue-300' : ''}`}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        maxLength={maxLength}
        minLength={minLength}
        pattern={pattern}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        readOnly={readOnly}
        id={id}
        name={name}
        {...props}
      />
      {sanitizeIndicator}
    </div>
  );
};

export default SanitizedInput; 