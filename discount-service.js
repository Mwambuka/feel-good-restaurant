// create discount service  
function createDiscountService() {
  const discountService = express.Router(); 
  const discounts = [
    { id: 1, code: 'SUMMER10', percentage: 10 },
    { id: 2, code: 'WINTER15', percentage: 15 },
    { id: 3, code: 'SPRING20', percentage: 20 }
  ];
}