"""Nexus Core — Pagination classes"""
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardResultsPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 200

    def get_paginated_response(self, data):
        return Response({
            'count':       self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'next':        self.get_next_link(),
            'previous':    self.get_previous_link(),
            'results':     data,
        })

    def get_paginated_response_schema(self, schema):
        return {
            'type': 'object',
            'properties': {
                'count':       {'type': 'integer'},
                'total_pages': {'type': 'integer'},
                'next':        {'type': 'string', 'nullable': True},
                'previous':    {'type': 'string', 'nullable': True},
                'results':     schema,
            },
        }


class LargePagination(PageNumberPagination):
    page_size = 100
    page_size_query_param = 'page_size'
    max_page_size = 1000


class SmallPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 50