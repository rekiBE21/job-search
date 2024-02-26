export class ApiFeature {
  constructor(mongoQuery, data) {
    this.mongoQuery = mongoQuery;
    this.data = data;
  }

  pagination() {
    if (this.data?.page <= 0) this.data.page = 1;
    let PAGE_NUMBER = this.data?.page * 1 || 1; // if string(NAN || 1)
    let PAGE_LIMIT = 3;
    let SKIP = (PAGE_NUMBER - 1) * PAGE_LIMIT;

    this.mongoQuery = this.mongoQuery.skip(SKIP).limit(PAGE_LIMIT);

    return this;
  }

  filter() {
    let filterObj = { ...this.data };
    // let execludedQuery = ["page", "sort", "fields", "filter"];
    // execludedQuery.forEach((q) => {
    //   delete filterObj[q];
    // }); or strictQuery
    filterObj = JSON.stringify(filterObj);
    filterObj = filterObj.replace(/(gt|gte|lt|lte)/g, (match) => `$${match}`);
    filterObj = JSON.parse(filterObj);
    this.mongoQuery.find(filterObj);
    return this;
  }

  sort() {
    if (this.data?.sort) {
      let sortBy = this.data.sort.split(",").join(" "); // sort by more than one feild
      this.mongoQuery.sort(sortBy);
    }
    return this;
  } 

  fields() {
    if (this.data?.fields) {
      let selected = this.data.fields.split(",").join(" ");
      this.mongoQuery.select(selected);
    }
    return this;
  }

  search() {
    if (this.data?.keyword) {
      // search : tv >>(lgtv , toshipatv) // any thing that include keyword(tv)
      this.mongoQuery.find({
        $or: [
          { title: { $regex: this.data.keyword, $options: "i" } },
          { description: { $regex: this.data.keyword, $options: "i" } },
        ],
      });
    }
    return this;
  }
}
