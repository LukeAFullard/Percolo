import csr from 'csr-matrix';
const matrix = csr.fromList([
  [0, 0, 1],
  [0, 1, 2],
  [1, 0, 3]
], 2, 2);
console.log(matrix.toDense());
