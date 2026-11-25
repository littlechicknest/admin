/** Quoted CSV cell; a leading quote mark stops Excel from running text such as "=HYPERLINK(…)" that a customer typed as their name. */
export const csvCell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`
