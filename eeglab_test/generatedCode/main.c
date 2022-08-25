//Link
#include <stdio.h>
#include <stdbool.h>
#include <complex.h>
#include <string.h>

// Function declarations
void kurt(unknown data, unknown* p_k);

// Entry-point function
int main(void)
{

// Initialize variables
unknown r;
unknown kdata;
unknown mn;
unknown diff;
unknown dsq;
unknown k;

// kurt() - return kurtosis of input data distribution
//
// Usage:
//   >> k=kurt(data)
//
// Algorithm:
//   Calculates kurtosis or normalized 4th moment of an input data vector
//   Given a matrix, returns a row vector giving the kurtosis' of the columns
//   (Ref: "Numerical Recipes," p. 612)
//
// Author: Martin Mckeown, CNL / Salk Institute, La Jolla, 10/2/96
// Copyright (C) Martin Mckeown, CNL / Salk Institute, La Jolla, 7/1996
//
// This file is part of EEGLAB, see http://www.eeglab.org
// for the documentation and details.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// 1. Redistributions of source code must retain the above copyright notice,
// this list of conditions and the following disclaimer.
//
// 2. Redistributions in binary form must reproduce the above copyright notice,
// this list of conditions and the following disclaimer in the documentation
// and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
// THE POSSIBILITY OF SUCH DAMAGE.
// 2/28/97 - made to return separate kurtosis estimates of columns -Scott Makeig
// 01-25-02 reformated help & license, added links -ad 
double tmp1;
indexM(size, &tmp1, data);
Matrix * tmp6 = onesM(2, {r, 1});
double tmp12;
indexM(sum, &tmp12, dsq .* dsq);
double tmp14;
indexM(std, &tmp14, kdata);
return 0;
}


// Subprograms

void kurt(unknown data, unknown* p_k)
{
*p_k = k;
 = tmp1;


if (r == 1)
{
kdata = data';
// if a row vector, make into a column vector
r = c;
}
else
{
kdata = data;
}
//fprintf('size of kdata = [%d,%d]\n',size(kdata,1),size(kdata,2));
mn = mean(kdata);

// find the column means
diff = kdata - tmp6 * mn;

// remove the column means
dsq = diff .* diff;

// square the data
k = (tmp12 ./ tmp14 .^ 4) ./ r - 3;

}