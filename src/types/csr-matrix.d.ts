declare module 'csr-matrix' {
  interface CsrMatrixStatic {
    (
      numRows: number,
      numCols: number,
      values?: number[],
      rowPointers?: number[],
      columnIndices?: number[]
    ): any;
    fromDense(matrix: number[][]): any;
    fromList(cells: [number, number, number][], numRows?: number, numCols?: number): any;
  }
  const csr: CsrMatrixStatic;
  export default csr;
}