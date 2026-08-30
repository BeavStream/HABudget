FROM python:3.12-alpine

WORKDIR /app
COPY app/ /app/
RUN pip install --no-cache-dir \
      fastapi==0.115.6 \
      "uvicorn[standard]==0.32.1"

EXPOSE 8099
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8099"]
