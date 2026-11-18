/** Keep unfocused insertion fields within their four-pixel layout slot. */
export const markdownSlotStyles = `
.insert-slot:not(:focus-within):not(:last-child) > .insert-field {
  box-sizing: border-box;
  height: 4px;
  max-height: 4px;
  line-height: 4px;
  overflow: hidden;
}
`;
